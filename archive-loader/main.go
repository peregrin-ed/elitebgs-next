package main

import (
	"bufio"
	"compress/bzip2"
	"encoding/json"
	"fmt"
	"io"
	"iter"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

const ArchiveFolderKey = "ARCHIVE_FOLDER"

var JournalTypes = []string{"FSDJump", "Location", "Docked"}

type message struct {
	Header messageHeader `json:"header"`
}

type messageHeader struct {
	GatewayTimestamp string `json:"gatewayTimestamp"`
}

func main() {
	err := godotenv.Load()
	if err != nil {
		log.Fatal("Error loading .env file", err)
	}

	workerUrl := os.Getenv("WORKER_URL")

	if os.Getenv("DOWNLOAD") == "false" {
		readBzip2FromFiles(workerUrl)
	} else {
		downloadBzip2Files(workerUrl)
	}
}

// downloadBzip2Files downloads streams bzip2 files from a given root URL, iterating over dates to create the full URL
// for each file. It streams the files and directly decompresses and sends the data to a worker URL.
func downloadBzip2Files(workerUrl string) {
	downloadUrl := os.Getenv("DOWNLOAD_URL")

	for date := range iterateDays() {
		for _, event := range JournalTypes {
			func() {
				fileName := fmt.Sprintf("Journal.%s-%s.jsonl.bz2", event, date.Format("2006-01-02"))
				fullUrl, err := url.JoinPath(downloadUrl, date.Format("2006-01"), fileName)
				if err != nil {
					log.Fatal("Error constructing URL:", err)
				}

				fmt.Printf("Download from %s...\n", fullUrl)

				response, err := http.Get(fullUrl)
				if err != nil {
					fmt.Printf("error getting from archive URL %s: %v", fullUrl, err)
					return
				}
				defer func(Body io.ReadCloser) {
					err := Body.Close()
					if err != nil {
						log.Println("Error closing response body:", err)
					}
				}(response.Body)

				if os.Getenv("DOWNLOAD_ONLY") == "true" {
					writeToLocalFile(response.Body, date, fileName)
				} else {
					decompressAndSend(response.Body, workerUrl)
				}
			}()
		}
	}
}

// iterateDays generates a sequence of dates from the start and end dates (inclusive) configured via the relevant
// environment variables
func iterateDays() iter.Seq[time.Time] {
	startDate := os.Getenv("START_DATE")
	endDate := os.Getenv("END_DATE")

	startTime, err := time.Parse("2006-01-02", startDate)
	if err != nil {
		log.Fatal("Error parsing start date:", err)
	}
	endTime, err := time.Parse("2006-01-02", endDate)
	if err != nil {
		log.Fatal("Error parsing end date:", err)
	}

	return func(yield func(time.Time) bool) {
		currentDate := startTime
		for !currentDate.After(endTime) {
			if !yield(currentDate) {
				return
			}

			currentDate = currentDate.AddDate(0, 0, 1)
		}
	}
}

// readBzip2FromFiles reads bzip2 files from a specified archive folder, decompresses them, and sends the data to a
// worker URL.
func readBzip2FromFiles(workerUrl string) {
	archiveFolder := os.Getenv(ArchiveFolderKey)

	for date := range iterateDays() {
		for _, event := range JournalTypes {
			dir := date.Format("2006-01")
			fname := "Journal." + event + "-" + date.Format("2006-01-02") + ".jsonl.bz2"
			f := filepath.Join(archiveFolder, dir, fname)
			readBzip2FromFile(workerUrl, f)
		}
	}
	/*
		dirs, err := os.ReadDir(archiveFolder)
		if err != nil {
			log.Fatal("Error reading archive folder:", err)
		}
		sort.Slice(dirs, func(i, j int) bool {
			return dirs[i].Name() < dirs[j].Name()
		})

		for _, dir := range dirs {
			if !dir.IsDir() {
				continue
			}
			readBzip2FromDirectory(workerUrl, dir)
		}

	*/
}

// readBzip2FromFile reads the specified file, decompresses it, and sends its data line-by-line to the worker URL.
func readBzip2FromFile(workerUrl string, filename string) {
	func() {
		reader, err := os.Open(filename)
		if err != nil {
			log.Printf("failed to open file %s: %v\n", filename, err)
			return
		}
		defer func(file *os.File) {
			err := file.Close()
			if err != nil {
				log.Println("Error closing file:", err)
			}
		}(reader)

		log.Printf("Processing %s...\n", filename)

		decompressAndSend(reader, workerUrl)
	}()
}

// decompressAndSend decompresses the bzip2 data from the reader and sends each line to the worker URL as a JSON payload.
func decompressAndSend(reader io.Reader, workerUrl string) {
	bz2Reader := bzip2.NewReader(reader)
	scanner := bufio.NewScanner(bz2Reader)
	startTime := time.Now()
	counter := 0
	for scanner.Scan() {
		func() {
			line := scanner.Text()
			response, err := http.Post(workerUrl, "application/json", strings.NewReader(line))
			if err != nil {
				fmt.Printf("error posting to worker URL %s: %v", workerUrl, err)
				return
			}
			defer func(Body io.ReadCloser) {
				err := Body.Close()
				if err != nil {
					log.Println("Error closing response body:", err)
				}
			}(response.Body)
			_, err = io.Copy(io.Discard, response.Body)
			if err != nil {
				fmt.Printf("error reading and dumping response body: %v", err)
			}
			var messageData message
			err = json.Unmarshal(scanner.Bytes(), &messageData)
			if err != nil {
				log.Println("Error closing file:", err)
			}
			elapsedTime := time.Since(startTime)
			counter++
			averageDuration := elapsedTime / time.Duration(counter)
			log.Printf("Processed %s, average execution time %s, total execution time %s, iterations %d\n",
				messageData.Header.GatewayTimestamp,
				averageDuration.String(),
				elapsedTime.String(),
				counter)

		}()
	}
	err := scanner.Err()
	if err != nil {
		log.Println("Error reading from bzip2 reader:", err)
	}
}

// writeToLocalFile saves the data to a local file for future processing without having to re-download.
func writeToLocalFile(reader io.Reader, date time.Time, fileName string) {
	dir := filepath.Join(os.Getenv(ArchiveFolderKey), date.Format("2006-01"))
	err := os.MkdirAll(dir, os.ModePerm)
	if err != nil {
		log.Printf("Error creating directory %s: %s", dir, err)
	}
	fo, err := os.Create(filepath.Join(dir, fileName))
	if err != nil {
		log.Printf("Error creating file %s: %s", fileName, err)
	}
	defer func() {
		err := fo.Close()
		if err != nil {
			log.Println("Error closing file:", err)
		}
	}()

	buf := make([]byte, 1024)
	for {
		n, err := reader.Read(buf)
		if err != nil && err != io.EOF {
			panic(err)
		}
		if n == 0 {
			break
		}
		if _, err := fo.Write(buf[:n]); err != nil {
			log.Println("Error writing data:", err)
		}
	}
}
