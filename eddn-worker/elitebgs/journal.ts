import type {
  EDDNBase,
  Faction,
  JournalMessage,
  Location,
  State,
  StationMessage,
  SystemMessage,
} from '@elitebgs/types/eddn.ts'
import { JournalEvents } from '@elitebgs/types/eddn.ts'
import { Op, Sequelize, Transaction } from 'sequelize'
import { difference, isEqualWith, uniq } from 'lodash-es'
import { Systems } from '../db/models/systems.ts'
import { SystemAliases } from '../db/models/system_aliases.ts'
import { Factions } from '../db/models/factions.ts'
import { ActiveStates } from '../db/models/active_states.ts'
import { RecoveringStates } from '../db/models/recovering_states.ts'
import { PendingStates } from '../db/models/pending_states.ts'
import { SystemFactionHistories } from '../db/models/system_faction_histories.ts'
import { ProcessingMessages } from '../processing-messages.ts'
import { SystemHistories } from '../db/models/system_histories.ts'
import { Stations } from '../db/models/stations.ts'
import { StationAliases } from '../db/models/station_aliases.ts'
import { StationHistories } from '../db/models/station_histories.ts'
import { StationHistoriesServices } from '../db/models/station_histories_services.ts'
import { StationHistoriesEconomies } from '../db/models/station_histories_economies.ts'

export type TrackResponse = {
  processed: boolean
  processingMessages: string[]
}

/** Responsible for handling EDDN journal messages. */
export class Journal {
//  static SCHEMA_OUTDATED = 'http://schemas.elite-markets.net/eddn/journal/1'
  static SCHEMA = 'https://eddn.edcd.io/schemas/journal/1'
  static SCHEMA_TEST = 'https://eddn.edcd.io/schemas/journal/1/test'

  /**
   * Returns the schema URL based on the environment variable TEST_SCHEMA. If TEST_SCHEMA is set to 'true', it returns
   * the test schema, otherwise it returns the production schema.
   */
  static getSchema() {
    return process.env.TEST_SCHEMA === 'true' ? Journal.SCHEMA_TEST : Journal.SCHEMA
  }

  /**
   * Tracks the system from the journal message. This method is called when a journal message is received and matches
   * the schema for journal messages.
   */
  static async trackSystem(journalMsg: JournalMessage, sequelize: Sequelize): Promise<TrackResponse> {

    // Only process FSDJump, Location and Docked event types
    if (
      journalMsg.message.event !== JournalEvents.FSDJump &&
      journalMsg.message.event !== JournalEvents.Location &&
      journalMsg.message.event !== JournalEvents.Docked
    ) {
      return { processed: false, processingMessages: [ProcessingMessages.EVENT_CHECK] }
    }

    const { hasSystemDetails, hasStationDetails, errors } = await this.checkMessage(journalMsg)
    if (errors.length > 0) {
      return { processed: false, processingMessages: errors }
    }

    this.coerceMessage(journalMsg, hasSystemDetails, hasStationDetails)

    return await sequelize.transaction(async (transaction) => {
      // First handle any system-related details
      if (hasSystemDetails) {
        return await this.processSystemMessage(journalMsg.header, journalMsg as SystemMessage, transaction)
      } else {
        return {
          system: null,
          processed: false,
          processingMessages: [],
        }
      }
    }).then(systemResult => {
      return sequelize.transaction(async (transaction) => {
        // Next handle any station-related details
        let stationResult: TrackResponse

        if (hasStationDetails) {
          let system: Systems
          if (systemResult.system) {
            system = systemResult.system
          } else {
            // Load the system based on the system address
            system = await Systems.findOne({
              where: { systemAddress: journalMsg.message.SystemAddress.toString() },
              transaction,
            })
            if (!system) {
              return { processed: false, processingMessages: [ProcessingMessages.SYSTEM_NOT_FOUND] }
            }
          }

          stationResult = await this.processStationMessage(journalMsg.header, journalMsg as StationMessage, system, transaction)

        } else {
          // No station details
          stationResult = {
            processed: false,
            processingMessages: [],
          }
        }

        return {
          processed: systemResult.processed || stationResult.processed,
          processingMessages: systemResult.processingMessages
            .concat(stationResult.processingMessages),
        };
      })
    }).catch(err => {
      return {
        processed: false,
        processingMessages: Array.isArray(err)
          ? err.map((element) => ProcessingMessages.DB_ERROR(element))
          : [ProcessingMessages.DB_ERROR(err)],
      }
    });
  }

  private static async processSystemMessage(messageHeader: EDDNBase["header"], systemMsg: SystemMessage,
                                            transaction: Transaction) {
    const {
      factions,
      processed: factionProcessed,
      processingMessages: factionProcessingMessages,
    } = await this.ensureFactions(systemMsg.message, transaction)

    const {
      system,
      processed: systemProcessed,
      processingMessages: systemProcessingMessages,
    } = await this.ensureSystemWAliases(systemMsg.message, transaction)

    const { processed: systemHistoriesProcessed, processingMessages: systemHistoriesProcessingMessages } =
      await this.ensureSystemHistory(systemMsg.message, messageHeader, system, factions, transaction)

    const { processed: factionHistoriesProcessed, processingMessages: factionHistoriesProcessingMessages } =
      await this.ensureSystemFactionHistory(systemMsg.message, messageHeader, system, factions, transaction)

    // If no errors occur, then the `processed` value is determined based on if at least 1 entity was processed.
    // And all the messages generated are also returned.
    return {
      system,
      processed: systemProcessed || systemHistoriesProcessed || factionProcessed || factionHistoriesProcessed,
      processingMessages: systemProcessingMessages
        .concat(systemHistoriesProcessingMessages)
        .concat(factionProcessingMessages)
        .concat(factionHistoriesProcessingMessages),
    }

  }

  private static async processStationMessage(messageHeader: EDDNBase["header"], stationMsg: StationMessage,
                                             system: Systems, transaction: Transaction) {
    const faction = await Factions.findOne({
      where: { nameLower: stationMsg.message.StationFaction.Name.toLowerCase() },
      transaction,
    })
    if (!faction) {
      return {
        processed: false,
        processingMessages: [ProcessingMessages.FACTION_NOT_FOUND(stationMsg.message.StationFaction.Name)],
      }
    } else {
      // TODO: Determine if we want to actually update the faction based on its FactionState value - probably not?
    }

    const {
      station,
      processed: stationProcessed,
      processingMessages: stationProcessingMessages,
    } = await this.ensureStationWAliases(stationMsg.message, system, transaction)

    const {
      processed: stationHistoriesProcessed,
      processingMessages: stationHistoriesProcessingMessages
    } = await this.ensureStationHistory(stationMsg.message, messageHeader, station, faction, transaction)

    return {
      processed: stationProcessed || stationHistoriesProcessed,
      processingMessages: stationProcessingMessages
        .concat(stationHistoriesProcessingMessages),
    }
  }

  /**
   * Find the system with the system address along with its aliases. If the system with the system address exists, check
   * if the name is the same and create an alias if not. An alias is only created if that alias is previously not
   * created. If the system address doesn't exist, a new record is created.
   */
  private static async ensureSystemWAliases(message: SystemMessage['message'], transaction: Transaction) {
    let system = await Systems.findOne({
      where: { systemAddress: message.SystemAddress.toString() },
      include: [SystemAliases],
      transaction,
    })

    if (!system) {
      system = await Systems.create(
        {
          starSystem: message.StarSystem,
          starSystemLower: message.StarSystem.toLowerCase(),
          systemAddress: message.SystemAddress.toString(),
          starPos: {
            type: 'Point',
            coordinates: message.StarPos,
            crs: { type: 'name', properties: { name: '0' } },
          },
        },
        {
          transaction,
        },
      )

      return { system, processed: true, processingMessages: [ProcessingMessages.SYSTEM_CREATED] }
    }

    if (message.StarSystem !== system.starSystem) {
      const systemAliases = system.SystemAliases
      // Checking the actual names so that even changing the case will create an alias.
      if (!systemAliases.some((alias) => alias.alias === message.StarSystem)) {
        await system.createSystemAlias(
          {
            alias: system.starSystem,
            aliasLower: system.starSystemLower,
          },
          { transaction },
        )
        await system.update(
          {
            starSystem: message.StarSystem,
            starSystemLower: message.StarSystem.toLowerCase(),
          },
          { transaction },
        )

        return { system, processed: true, processingMessages: [ProcessingMessages.SYSTEM_ALIAS_UPDATED] }
      }
    }

    return { system, processed: false, processingMessages: [ProcessingMessages.SYSTEM_NOT_UPDATED] }
  }

  /**
   * Get the current system history record, i.e. one with `validTo` as NULL and records that became valid within the
   * last 48 hours. If no current history record is found or if the message has different data than the current record,
   * a fresh history record is created.
   */
  private static async ensureSystemHistory(
    message: SystemMessage['message'],
    header: EDDNBase['header'],
    system: Systems,
    factions: Factions[],
    transaction: Transaction,
  ) {
    // Get the current status of the system by finding the record which doesn't have a `validTo`.
    const currentSystemStatusPromise = system.getSystemHistories({
      where: {
        validTo: {
          [Op.is]: null,
        },
      },
      limit: 1,
      order: [['validFrom', 'DESC']],
      transaction,
    })

    // Get all the historical records of the system in the last 48 hours that have a `validTo`.
    const systemHistoriesPromise = system.getSystemHistories({
      where: {
        validFrom: {
          [Op.gte]: this.validFrom(header),
        },
        validTo: {
          [Op.not]: null,
        },
      },
      order: [['validFrom', 'DESC']],
      transaction,
    })

    const promiseSettled = await Journal.PromiseSettle([currentSystemStatusPromise, systemHistoriesPromise])
    const currentSystemStatus = promiseSettled[0].at(0)
    const systemHistories = promiseSettled[1]

    // Get the faction data of the system faction.
    const systemFaction = factions.find((faction) => faction.nameLower === message.SystemFaction.Name.toLowerCase())

    // If the `SystemFaction` is not found in the factions table, something is broken in the message and hence, reject.
    if (!systemFaction) {
      throw new Error(ProcessingMessages.SYSTEM_HISTORY_SYSTEM_FACTION_NOT_FOUND(message.SystemFaction.Name))
    }

    // If the message timestamp is older than the start of the latest record, or older than the end of the latest
    // record, skip processing.
    if (
      currentSystemStatus &&
      (message.timestamp < currentSystemStatus.validFrom || message.timestamp < currentSystemStatus.validTo)
    ) {
      return { processed: false, processingMessages: [ProcessingMessages.SYSTEM_HISTORY_OLDER] }
    }

    // Check if the message contains the same data as the current state.
    if (currentSystemStatus && Journal.checkSystemHistoryEquality(currentSystemStatus, message, systemFaction.id)) {
      return { processed: false, processingMessages: [ProcessingMessages.SYSTEM_HISTORY_NOT_UPDATED] }
    }

    // Run some checks on the message with the existing history to verify that it should be processed. If the system
    // data matches all values for any data in the last 48 hours, skip processing.
    if (
      systemHistories.length > 0 &&
      systemHistories.some((history) => Journal.checkSystemHistoryEquality(history, message, systemFaction.id))
    ) {
      return { processed: false, processingMessages: [ProcessingMessages.SYSTEM_HISTORY_CACHED] }
    }

    // If there is a current system status history record, mark the `validTo` of the latest record as a new record
    // is to be added.
    if (currentSystemStatus) {
      await currentSystemStatus.update(
        {
          validTo: message.timestamp,
        },
        { transaction },
      )
    }
    await system.createSystemHistory(
      {
        population: message.Population,
        systemGovernment: message.SystemGovernment,
        systemAllegiance: message.SystemAllegiance,
        systemSecurity: message.SystemSecurity,
        systemEconomy: message.SystemEconomy,
        systemSecondEconomy: message.SystemSecondEconomy,
        systemFactionId: systemFaction.id,
        systemFactionState: message.SystemFaction.FactionState,
        validFrom: message.timestamp,
      },
      { transaction },
    )

    return { processed: true, processingMessages: [ProcessingMessages.SYSTEM_HISTORY_CREATED] }
  }

  /**
   * Find all the relevant factions by their faction names. If a faction with the faction name doesn't exist, a new
   * record is created.
   */
  private static async ensureFactions(message: SystemMessage['message'], transaction: Transaction) {
    const factionPromises = await Journal.PromiseSettle(
      message.Factions.map(async (messageFaction) => {
        return this.ensureFaction(messageFaction, transaction)
      }),
    )

    return {
      factions: factionPromises.map((factionPromise) => factionPromise.faction),
      processed: factionPromises.some((factionPromise) => factionPromise.processed),
      processingMessages: factionPromises.flatMap((factionPromise) => factionPromise.processingMessages),
    }
  }

  /**
   * Find the faction with the faction name. If the faction with the faction name doesn't exist, a new record is
   * created.
   */
  private static async ensureFaction(messageFaction: Faction, transaction: Transaction) {
    let faction = await Factions.findOne({
      where: { nameLower: messageFaction.Name.toLowerCase() },
      transaction,
    })

    if (!faction) {
      faction = await Factions.create(
        {
          name: messageFaction.Name,
          nameLower: messageFaction.Name.toLowerCase(),
          government: messageFaction.Government,
          allegiance: messageFaction.Allegiance,
        },
        {
          transaction,
        },
      )

      return {
        faction,
        processed: true,
        processingMessages: [ProcessingMessages.FACTION_CREATED(messageFaction.Name)],
      }
    }

    return {
      faction,
      processed: false,
      processingMessages: [ProcessingMessages.FACTION_NOT_UPDATED(messageFaction.Name)],
    }
  }

  /** Get all the current faction history records and all the historical records for the last 48 hours. */
  private static async ensureSystemFactionHistory(
    message: SystemMessage['message'],
    header: EDDNBase['header'],
    system: Systems,
    factions: Factions[],
    transaction: Transaction,
  ) {
    // Get the current status of all the factions currently in the system, determined by searching for records that
    // don't have a `validTo` entry.
    const currentFactionsStatusPromise = system.getSystemFactionHistories({
      where: {
        validTo: {
          [Op.is]: null,
        },
      },
      order: [
        ['validFrom', 'DESC'],
        ['factionId', 'ASC'],
      ],
      include: [ActiveStates, PendingStates, RecoveringStates],
      transaction,
    })

    // Get all the historical records for all the factions in teh system in the last 48 hours that have a `validTo`.
    const factionHistoriesPromise = system.getSystemFactionHistories({
      where: {
        validFrom: {
          [Op.gte]: this.validFrom(header),
        },
        validTo: {
          [Op.not]: null,
        },
      },
      order: [
        ['validFrom', 'DESC'],
        ['factionId', 'ASC'],
      ],
      include: [ActiveStates, PendingStates, RecoveringStates],
      transaction,
    })

    const promiseSettled = await Journal.PromiseSettle([currentFactionsStatusPromise, factionHistoriesPromise])
    const currentFactionsStatus = promiseSettled[0]
    const factionsHistories = promiseSettled[1]

    const factionsCurrentlyPresent = uniq(currentFactionsStatus.map((systemFaction) => systemFaction.factionId))
    const factionsInMessage = factions.map((faction) => faction.id)

    // Create 3 sets of factions based on what kind of operation needs to be done on them.
    const factionsRemovedIds = difference(factionsCurrentlyPresent, factionsInMessage)

    const processingMessages: string[] = []

    // This starts a complicated logic to figure out if a faction that's supposedly removed from the system is actually
    // removed or if the message is a cached message. For this, we need to figure out if the faction was added within
    // the last 48 hours. Which means that in the last 48 hours there should be a gap between the `validTo` of one
    // record and the `validFrom` of the next record.
    // An edge case also needs to be taken into account where the first record that became valid in the last 48 hours
    // was the addition of the faction, in which case, we don't have a previous record to compare against. So, if we
    // don't find a gap between 2 records in the last 48 hours, we need to find the last record before 48 hours and
    // compare it's `validTo` to the `validFrom` of the first record that became valid within 48 hours.
    const filteredFactionRemovedIds = []

    for (const factionRemovedId of factionsRemovedIds) {
      const factionHistories = factionsHistories.filter((history) => history.factionId === factionRemovedId)
      const currentFactionStatus = currentFactionsStatus.filter((status) => status.factionId === factionRemovedId)

      const completeFactionHistories = currentFactionStatus.concat(factionHistories)

      // `checkNewEntry` will keep track if the faction is a newly entered one or not.
      let checkNewEntry = false

      // Check every adjacent record's `validTo` and `validFrom`.
      for (let i = 0; i < completeFactionHistories.length - 1; i++) {
        if (completeFactionHistories[i].validFrom > completeFactionHistories[i + 1].validTo) {
          checkNewEntry = true
          break
        }
      }

      // If no gaps are found, we need to check with the last record that went valid before 48 hours.
      if (!checkNewEntry) {
        const factionHistoryMarginCheck = await system.getSystemFactionHistories({
          where: {
            factionId: factionRemovedId,
            validFrom: {
              [Op.lt]: this.validFrom(header),
            },
          },
          limit: 1,
          transaction,
        })
        checkNewEntry =
          factionHistoryMarginCheck.at(0)?.validTo <
          completeFactionHistories[completeFactionHistories.length - 1].validFrom
      }

      if (checkNewEntry) {
        processingMessages.push(ProcessingMessages.SYSTEM_FACTION_HISTORY_CACHED(factionRemovedId))
        continue
      }

      filteredFactionRemovedIds.push(factionRemovedId)
    }

    // Filter all factions that were removed, and update the validTo for each of these records.
    const systemFactionHistoriesRemovedPromise = currentFactionsStatus
      .filter((status) => filteredFactionRemovedIds.includes(status.factionId))
      .map(async (currentFactionStatus) => {
        await currentFactionStatus.update(
          {
            validTo: message.timestamp,
          },
          { transaction },
        )
        processingMessages.push(ProcessingMessages.SYSTEM_FACTION_HISTORY_CLOSED(currentFactionStatus.factionId))
        return true
      })

    const systemFactionHistoriesUpdatedPromise = factions.map(async (faction) => {
      // We get the current faction in the message.
      const factionInMessage = message.Factions.find(
        (messageFaction) => messageFaction.Name.toLowerCase() === faction.nameLower,
      )

      // Get the current system faction historical record for the faction. This record might not exist in which case, a
      // new record just needs to be added.
      const currentFactionStatus = currentFactionsStatus.find((status) => status.factionId === faction.id)

      // If the message timestamp is older than the start of the latest record, or older than the end of the latest
      // record, skip processing.
      if (
        currentFactionStatus &&
        (message.timestamp < currentFactionStatus.validFrom || message.timestamp < currentFactionStatus.validTo)
      ) {
        processingMessages.push(ProcessingMessages.SYSTEM_FACTION_HISTORY_OLDER(factionInMessage.Name))
        return false
      }

      // Check if the message contains the same data as the current state.
      if (currentFactionStatus && this.checkSystemFactionHistoryEquality(currentFactionStatus, factionInMessage)) {
        processingMessages.push(ProcessingMessages.SYSTEM_FACTION_HISTORY_NOT_UPDATED(factionInMessage.Name))
        return false
      }

      // If the faction data matches all values for any data in the last 48 hours, skip processing.
      if (
        factionsHistories.length > 0 &&
        factionsHistories
          .filter((history) => history.factionId === faction.id)
          // In here each history record for this faction gets checked with the message data to verify if there are
          // any records that match.
          .some((history) => this.checkSystemFactionHistoryEquality(history, factionInMessage))
      ) {
        processingMessages.push(ProcessingMessages.SYSTEM_FACTION_HISTORY_CACHED(faction.name))
        return false
      }

      // If there is a current system faction status history record, mark the `validTo` of the latest record as a new
      // record is to be added.
      if (currentFactionStatus) {
        await currentFactionStatus.update(
          {
            validTo: message.timestamp,
          },
          { transaction },
        )
      }

      const createdSystemFactionHistory = await system.createSystemFactionHistory(
        {
          factionId: faction.id,
          factionState: factionInMessage.FactionState,
          influence: factionInMessage.Influence,
          happiness: factionInMessage.Happiness,
          validFrom: message.timestamp,
        },
        { transaction },
      )
      const activeStatesPromise = factionInMessage.ActiveStates
        ? factionInMessage.ActiveStates.map((activeState) => {
            return createdSystemFactionHistory.createActiveState(
              {
                state: activeState.State,
              },
              { transaction },
            )
          })
        : []
      const pendingStatesPromise = factionInMessage.PendingStates
        ? factionInMessage.PendingStates.map((pendingState) => {
            return createdSystemFactionHistory.createPendingState(
              {
                state: pendingState.State,
                trend: pendingState.Trend,
              },
              { transaction },
            )
          })
        : []
      const recoveringStatesPromise = factionInMessage.RecoveringStates
        ? factionInMessage.RecoveringStates.map((recoveringState) => {
            return createdSystemFactionHistory.createRecoveringState(
              {
                state: recoveringState.State,
                trend: recoveringState.Trend,
              },
              { transaction },
            )
          })
        : []

      await Journal.PromiseSettle(activeStatesPromise.concat(pendingStatesPromise).concat(recoveringStatesPromise))

      processingMessages.push(ProcessingMessages.SYSTEM_FACTION_HISTORY_CREATED(factionInMessage.Name))
      return true
    })

    const promiseResolutions = await Journal.PromiseSettle(
      systemFactionHistoriesRemovedPromise.concat(systemFactionHistoriesUpdatedPromise),
    )

    const processed = promiseResolutions.some((resolution) => resolution)

    return { processed, processingMessages: processingMessages }
  }

  /**
   * Find the station with the market ID along with its aliases. If the station with the market ID exists, check
   * if the name is the same and create an alias if not. An alias is only created if that alias is previously not
   * created. If the market ID doesn't exist, a new record is created.
   */
  private static async ensureStationWAliases(
    message: StationMessage['message'],
    system: Systems,
    transaction: Transaction
  ) {
    let station = await Stations.findOne({
      where: { marketId: message.MarketID.toString() },
      include: [StationAliases],
      transaction,
    })
    if (!station) {
      station = await Stations.create(
        {
          marketId: message.MarketID.toString(),
          systemId: system.id,
          stationName: message.StationName,
          stationNameLower: message.StationName.toLowerCase(),
          distanceFromStar: Math.floor(message.DistFromStarLS),
        },
        {
          transaction,
        },
      )

      return { station, processed: true, processingMessages: [ProcessingMessages.STATION_CREATED] }
    }

    if (message.StationName !== station.stationName) {
      const stationAliases = station.StationAliases
      // Checking the actual names so that even changing the case will create an alias.
      if (!stationAliases.some((alias) => alias.alias === message.StationName)) {
        await station.createStationAlias(
          {
            alias: station.stationName,
            aliasLower: station.stationNameLower,
          },
          { transaction },
        )
        await station.update(
          {
            stationName: message.StationName,
            stationNameLower: message.StationName.toLowerCase(),
          },
          { transaction },
        )

        return { station, processed: true, processingMessages: [ProcessingMessages.STATION_ALIAS_UPDATED] }
      }
    }

    return { station, processed: false, processingMessages: [ProcessingMessages.STATION_NOT_UPDATED] }
  }

  /** Get all the current station history records and all the historical records for the last 48 hours. */
  private static async ensureStationHistory(
    message: StationMessage['message'],
    header: EDDNBase['header'],
    station: Stations,
    faction: Factions,
    transaction: Transaction,
  ) {

    // Get the current status of the station by finding the record which doesn't have a `validTo`.
    const currentStationStatusPromise = station.getStationHistories({
      where: {
        validTo: {
          [Op.is]: null,
        },
      },
      limit: 1,
      order: [['validFrom', 'DESC']],
      include: [StationHistoriesServices, StationHistoriesEconomies],
      transaction,
    })

    // Get all the historical records of the station in the last 48 hours that have a `validTo`.
    const stationHistoriesPromise = station.getStationHistories({
      where: {
        validFrom: {
          [Op.gte]: this.validFrom(header),
        },
        validTo: {
          [Op.not]: null,
        },
      },
      order: [['validFrom', 'DESC']],
      include: [StationHistoriesServices, StationHistoriesEconomies],
      transaction,
    })

    const promiseSettled = await Journal.PromiseSettle([currentStationStatusPromise, stationHistoriesPromise])
    const currentStationStatus = promiseSettled[0].at(0)
    const stationHistories = promiseSettled[1]

    // If the message timestamp is older than the start of the latest record, or older than the end of the latest
    // record, skip processing.
    if (
      currentStationStatus &&
      (message.timestamp < currentStationStatus.validFrom || message.timestamp < currentStationStatus.validTo)
    ) {
      return { processed: false, processingMessages: [ProcessingMessages.STATION_HISTORY_OLDER] }
    }

    // Check if the message contains the same data as the current state.
    if (currentStationStatus && this.checkStationHistoryEquality(currentStationStatus, message, faction.id)) {
      return { processed: false, processingMessages: [ProcessingMessages.SYSTEM_HISTORY_NOT_UPDATED] }
    }

    // Run some checks on the message with the existing history to verify that it should be processed. If the station
    // data matches all values for any data in the last 48 hours, skip processing.
    if (
      stationHistories.length > 0 &&
      stationHistories.some((history) => this.checkStationHistoryEquality(history, message, faction.id))
    ) {
      return { processed: false, processingMessages: [ProcessingMessages.SYSTEM_HISTORY_CACHED] }
    }

    // If there is a current station status history record, mark the `validTo` of the latest record as a new record
    // is to be added.
    if (currentStationStatus) {
      await currentStationStatus.update(
        {
          validTo: message.timestamp,
        },
        { transaction },
      )
    }

    const createdStationHistory = await station.createStationHistory(
      {
        stationAllegiance: message.StationAllegiance,
        stationEconomy: message.StationEconomy,
        stationGovernment: message.StationGovernment,
        stationType: message.StationType,
        stationFactionId: faction.id,
        stationFactionState: message.StationFaction.FactionState,
        validFrom: message.timestamp,
      },
      { transaction },
    )

    const servicesPromises = message.StationServices && message.StationServices.length > 0
      ? (message.StationServices.map((service) => {
        return createdStationHistory.createStationHistoriesService(
          {
            name: service,
          },
          { transaction },
        )
      }))
      : []

    const economiesPromises = message.StationEconomies && message.StationEconomies.length > 0
      ? (message.StationEconomies.map((economy) => {
        return createdStationHistory.createStationHistoriesEconomy(
          {
            name: economy.Name,
            proportion: economy.Proportion,
          },
          { transaction },
        )
      }))
      : []

    await Journal.PromiseSettle(servicesPromises.concat(economiesPromises))

    return { processed: true, processingMessages: [ProcessingMessages.STATION_HISTORY_CREATED] }
  }

  /** Compare a `SystemHistory` record with the system in a message field by field. */
  private static checkSystemHistoryEquality(
    record: SystemHistories,
    message: SystemMessage['message'],
    systemFactionId: string,
  ): boolean {
    return (
      record.population === message.Population &&
      record.systemGovernment === message.SystemGovernment &&
      record.systemAllegiance === message.SystemAllegiance &&
      record.systemSecurity === message.SystemSecurity &&
      record.systemEconomy === message.SystemEconomy &&
      record.systemSecondEconomy === message.SystemSecondEconomy &&
      record.systemFactionId === systemFactionId &&
      record.systemFactionState === message.SystemFaction.FactionState
    )
  }

  /** Compare a `SystemFactionHistory` record with the faction in a message field by field. */
  private static checkSystemFactionHistoryEquality(record: SystemFactionHistories, message: Faction): boolean {
    return (
      record.influence === message.Influence &&
      record.happiness === message.Happiness &&
      record.factionState === message.FactionState &&
      isEqualWith(record.ActiveStates, message.ActiveStates, (historyElement: ActiveStates, messageElement: State) => {
        return historyElement.state === messageElement.State
      }) &&
      isEqualWith(
        record.PendingStates,
        message.PendingStates,
        (recordElement: PendingStates, messageElement: State) => {
          return recordElement.state === messageElement.State && recordElement.trend === messageElement.Trend
        },
      ) &&
      isEqualWith(
        record.RecoveringStates,
        message.RecoveringStates,
        (historyElement: RecoveringStates, messageElement: State) => {
          return historyElement.state === messageElement.State && historyElement.trend === messageElement.Trend
        },
      )
    )
  }

  /** Compare a `StationHistory` record with the station in a message field by field. */
  private static checkStationHistoryEquality(
    record: StationHistories,
    message: StationMessage['message'],
    factionId: string,
  ): boolean {
    // First check the "primary" attributes
    if (
      record.stationAllegiance !== message.StationAllegiance ||
      record.stationEconomy !== message.StationEconomy ||
      record.stationGovernment !== message.StationGovernment ||
      record.stationType !== message.StationType ||
      record.stationFactionId !== factionId ||
      record.stationFactionState !== message.StationFaction.FactionState
    ) {
      return false;
    }

    // Next check the services
    if (record.StationHistoriesServices.length !== message.StationServices.length) {
      return false;
    }
    const mServices = new Set(message.StationServices);
    for (let i = 0; i < record.StationHistoriesServices.length; i++) {
      if (!mServices.has(record.StationHistoriesServices[i].name)) {
        return false;
      }
    }

    // Finally check the economies
    if (record.StationHistoriesEconomies.length !== message.StationEconomies.length) {
      return false;
    }
    const mEconomies = new Map(message.StationEconomies.map(se => [se.Name, se.Proportion]));
    for (let i = 0; i < record.StationHistoriesEconomies.length; i++) {
      const economy = record.StationHistoriesEconomies[i];
      if (!mEconomies.has(economy.name) || mEconomies.get(economy.name) !== economy.proportion) {
        return false;
      }
    }
    return true;
  }

  /**
   * Checks if the message contains all required fields based on the event type. If any field is missing, returns the
   * relevant error(s). Also returns whether a valid system-related and/or station-related message was found in the
   * journal message
   */
  private static async checkMessage(journalMsg: JournalMessage) {
    try {

      let hasSystemDetails = false
      let hasStationDetails = false

      if (journalMsg.message.event === JournalEvents.FSDJump || journalMsg.message.event === JournalEvents.Location) {
        // For FSDJump and Location messages, check that the system-related attributes are valid. Note that for Location
        // messages, even if the station-related fields aren't valid, we still process the system-related information
        const errors = await this.checkSystemMessage((journalMsg as SystemMessage).message, journalMsg.message.event)
        // Skip processing if the message contains data invalid for EliteBGS.
        if (errors.length > 0) {
          return { hasSystemDetails: false, hasStationDetails: false, errors: errors }
        }
        hasSystemDetails = true

        if (journalMsg.message.event === JournalEvents.Location) {
          // For Location messages, only check that the station-related attributes are valid if Docked is true, but
          // don't return any errors even if the attributes aren't valid
          const locationMsg = (journalMsg as Location).message
          if (locationMsg.Docked === true) {
            const errors = await this.checkStationMessage((journalMsg as StationMessage).message, journalMsg.message.event)
            hasStationDetails = errors.length === 0
          }
        }

      } else if (journalMsg.message.event === JournalEvents.Docked) {
        // For Docked messages, always check the station-related attributes are valid
        const errors = await this.checkStationMessage((journalMsg as StationMessage).message, journalMsg.message.event)
        if (errors.length > 0) {
          return { hasSystemDetails: false, hasStationDetails: false, errors: errors }
        }
        hasStationDetails = true
      }

      return {
        hasSystemDetails: hasSystemDetails, hasStationDetails: hasStationDetails, errors: [],
      }
    } catch (err) {
      return {
        hasSystemDetails: false, hasStationDetails: false, errors: [ProcessingMessages.VALIDATION_ERROR(err)],
      }
    }

  }

  /**
   * Checks if the system message contains all required fields. If any field is missing, it logs a warning and returns
   * false, indicating that the message should not be processed.
   */
  private static async checkSystemMessage(message: SystemMessage['message'], eventType: string) {
    const errors: string[] = []
    if (message.timestamp < new Date('2017-10-07T00:00:00Z') || message.timestamp > new Date()) {
      errors.push(
        `Received ${eventType} message with invalid timestamp: ${message.timestamp.toISOString()}. Skipping processing.`,
      )
    }
    if (message.StarSystem === undefined) {
      errors.push('Received ${eventType} message without StarSystem. Skipping processing.')
    }
    if (message.SystemAddress === undefined) {
      errors.push(
        `Received ${eventType} message without SystemAddress. Skipping processing. StarSystem: ${message.StarSystem}`,
      )
    }
    if (message.timestamp === undefined) {
      errors.push(`Received ${eventType} message without timestamp. Skipping processing. StarSystem: ${message.StarSystem}`)
    }
    if (message.StarPos === undefined) {
      errors.push(`Received ${eventType} message without StarPos. Skipping processing. StarSystem: ${message.StarSystem}`)
    }
    if (message.SystemSecurity === undefined) {
      errors.push(
        `Received ${eventType} message without SystemSecurity. Skipping processing. StarSystem: ${message.StarSystem}`,
      )
    }
    if (message.SystemGovernment === undefined) {
      errors.push(
        `Received ${eventType} message without SystemGovernment. Skipping processing. StarSystem: ${message.StarSystem}`,
      )
    }
    if (message.SystemAllegiance === undefined) {
      errors.push(
        `Received ${eventType} message without SystemAllegiance. Skipping processing. StarSystem: ${message.StarSystem}`,
      )
    }
    if (message.SystemEconomy === undefined) {
      errors.push(
        `Received ${eventType} message without SystemEconomy. Skipping processing. StarSystem: ${message.StarSystem}`,
      )
    }
    if (message.SystemSecondEconomy === undefined) {
      errors.push(
        `Received ${eventType} message without SystemSecondEconomy. Skipping processing. StarSystem: ${message.StarSystem}`,
      )
    }
    if (message.Population === undefined) {
      errors.push(`Received ${eventType} message without Population. Skipping processing. StarSystem: ${message.StarSystem}`)
    }
    if (!message.Factions || message.Factions.length === 0) {
      errors.push(`Received ${eventType} message without Factions. Skipping processing. StarSystem: ${message.StarSystem}`)
    }
    return errors
  }

  /**
   * Checks if the station-related message contains all required fields. If any field is missing, it logs a warning and
   * returns false, indicating that the message should not be processed.
   */
  private static async checkStationMessage(message: StationMessage['message'], eventType: string) {
    const errors: string[] = []
    if (message.MarketID === undefined) {
      errors.push(
        `Received ${eventType} message without MarketID. Skipping processing. StarSystem: ${message.StarSystem}`,
      )
    }
    if (!message.StationEconomies || message.StationEconomies.length === 0) {
      errors.push(`Received ${eventType} message without StationEconomies. Skipping processing. StarSystem: ${message.StarSystem}`)
    }
    if (message.StationEconomy === undefined) {
      errors.push(
        `Received ${eventType} message without StationEconomy. Skipping processing. StarSystem: ${message.StarSystem}`,
      )
    }
    if (message.StationGovernment === undefined) {
      errors.push(
        `Received ${eventType} message without StationGovernment. Skipping processing. StarSystem: ${message.StarSystem}`,
      )
    }
    if (message.StationName === undefined) {
      errors.push(
        `Received ${eventType} message without StationName. Skipping processing. StarSystem: ${message.StarSystem}`,
      )
    }
    if (!message.StationServices || message.StationServices.length === 0) {
      errors.push(`Received ${eventType} message without StationServices. Skipping processing. StarSystem: ${message.StarSystem}`)
    }
    if (message.StationType === undefined) {
      errors.push(
        `Received ${eventType} message without StationType. Skipping processing. StarSystem: ${message.StarSystem}`,
      )
    }
    return errors
  }

  /** Fix certain issues that are expected in the incoming message. */
  private static coerceMessage(journalMsg: JournalMessage, hasSystemDetails: boolean, hasStationDetails: boolean) {
    if (hasSystemDetails) {
      const systemMsg = (journalMsg as SystemMessage).message
      if (!systemMsg.SystemFaction.FactionState) {
        systemMsg.SystemFaction.FactionState = 'None'
      }
    }
    if (hasStationDetails) {
      const stationMsg = (journalMsg as StationMessage).message
      if (!stationMsg.StationAllegiance) {
        stationMsg.StationAllegiance = 'Independent'
      }
      if (stationMsg.StationFaction && !stationMsg.StationFaction.FactionState) {
        stationMsg.StationFaction.FactionState = 'None'
      }
    }
  }

  private static async PromiseSettle<T>(values: Promise<T>[]): Promise<T[]> {
    const promiseSettled = await Promise.allSettled(values)
    const rejects = promiseSettled.filter((promise) => promise.status === 'rejected')
    if (rejects.length > 0) {
      throw rejects.map((promise) => promise.reason)
    }
    return promiseSettled.map((promise) => promise.status === 'fulfilled' && promise.value)
  }

  private static validFrom(header: EDDNBase['header']) {
    let ts: number
    if (process.env.LOAD_ARCHIVE === 'true') {
      ts = header.gatewayTimestamp.getTime()
    } else {
      ts = Date.now()
    }
    return new Date(ts - 172800000)
  }

}
