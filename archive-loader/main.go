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
	"sort"
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
	downloadStartDate := os.Getenv("DOWNLOAD_START_DATE")
	downloadEndDate := os.Getenv("DOWNLOAD_END_DATE")

	downloadStartTime, err := time.Parse("2006-01-02", downloadStartDate)
	if err != nil {
		log.Fatal("Error parsing start date:", err)
	}
	downloadEndTime, err := time.Parse("2006-01-02", downloadEndDate)
	if err != nil {
		log.Fatal("Error parsing end date:", err)
	}

	for _, event := range JournalTypes {
		for date := range iterateDays(downloadStartTime, downloadEndTime) {
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

// iterateDays generates a sequence of dates from startDate to endDate, inclusive.
func iterateDays(startDate, endDate time.Time) iter.Seq[time.Time] {
	return func(yield func(time.Time) bool) {
		currentDate := startDate
		for !currentDate.After(endDate) {
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
}

// readBzip2FromDirectory reads all the files in the specified directory, decompresses them, and sends the data to a
// worker URL.
func readBzip2FromDirectory(workerUrl string, dir os.DirEntry) {
	files, err := os.ReadDir(filepath.Join(os.Getenv(ArchiveFolderKey), dir.Name()))
	if err != nil {
		log.Fatal("Error reading archive folder:", err)
	}

	sort.Slice(files, func(i, j int) bool {
		return files[i].Name() < files[j].Name()
	})

	for _, file := range files {
		if strings.HasSuffix(file.Name(), ".bz2") {
			func() {
				filePath := filepath.Join(os.Getenv(ArchiveFolderKey), dir.Name(), file.Name())
				reader, err := os.Open(filePath)
				if err != nil {
					fmt.Printf("failed to open file %s: %v", filePath, err)
					return
				}
				defer func(file *os.File) {
					err := file.Close()
					if err != nil {
						log.Println("Error closing file:", err)
					}
				}(reader)

				log.Printf("Processing %s...\n", filePath)

				decompressAndSend(reader, workerUrl)
			}()
		}
	}
}

// decompressAndSend decompresses the bzip2 data from the reader and sends each line to the worker URL as a JSON payload.
func decompressAndSend(reader io.Reader, workerUrl string) {
	bz2Reader := bzip2.NewReader(reader)
	scanner := bufio.NewScanner(bz2Reader)
	startTime := time.Now()
	counter := 0
	for scanner.Scan() {
		func() {

			// TODO: Remove this!
			if counter < 200 {

				line := scanner.Text()

				println(line)

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
			}
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
