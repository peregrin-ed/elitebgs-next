import { satisfies } from 'semver'
import { Sequelize } from 'sequelize'
import type { EDDNBase, JournalMessage } from '@elitebgs/types/eddn.ts'
import { EDDN as eddnModel } from './db/models/eddn.ts'
import { Journal } from './elitebgs/journal.ts'
import softwareGuards from './eddn-software-guards.json' with { type: 'json' }

export class EDDN {
  static async handleMessage(message: EDDNBase, sequelize: Sequelize) {
    let processed: boolean = false
    let processingMessages: string[] = []
    if (message.$schemaRef === Journal.getSchema()) {
      if (parseFloat(message.header.gameversion) < 4) {
        processingMessages.push(
          `Received message from legacy game version: ${message.header.gameversion}. Skipping processing.`,
        )
      } else if (!this.handleMessageSoftware(message.header.softwareName, message.header.softwareVersion)) {
        processingMessages.push(
          `Received message from disallowed software: ${message.header.softwareName}. Skipping processing.`,
        )
      } else {
        ;({ processed, processingMessages } = await Journal.trackSystem(message as JournalMessage, sequelize))
      }
    } else {
      processingMessages = ['Received message not from the Journal schema. Skipping processing.']
    }
    await EDDN.saveMessage(message.$schemaRef, message.header, message, processed, processingMessages)
  }

  private static handleMessageSoftware(softwareName: string, softwareVersion: string): boolean {
    if (
      softwareGuards.disallowed.some((element) => {
        const match = new RegExp(element.softwareName).test(softwareName)
        // If the software is disallowed for all versions, don't allow it.
        if (match && element.allVersions) {
          return true
        }
        // If the software is disallowed for specific versions, don't allow it.
        if (match && element.softwareVersion !== '0.0.0') {
          return satisfies(softwareVersion, element.softwareVersion, true)
        }
        return false
      })
    ) {
      return false
    }
    return !!softwareGuards.allowed.some((element) => {
      const match = new RegExp(element.softwareName).test(softwareName)
      // If the software is not in the allowed list, don't allow it.
      if (!match) {
        return false
      }
      // If the software version is allowed, allow it, else, don't.
      return satisfies(softwareVersion, element.softwareVersion, true)
    })
  }

  private static async saveMessage(
    schemaRef: string,
    header: unknown,
    message: unknown,
    processed: boolean,
    processingMessages: string[],
  ) {
    const eddn = new eddnModel({
      schemaRef,
      header,
      message,
      processed,
      processingMessages,
    })

    await eddn.save()
  }
}
