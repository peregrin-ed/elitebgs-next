export class ProcessingMessages {
  static EVENT_CHECK = 'Not a FSDJump, Location or Docked event. Skipping processing.'

  static VALIDATION_ERROR(err: unknown) {
    return `Error occurred while validating message. Skipping processing. Error: ${err}`
  }

  static DB_ERROR(err: unknown) {
    return `Error occurred while in DB operation. Skipping processing. Error: ${err}`
  }

  static SYSTEM_CREATED = 'System created.'

  static SYSTEM_ALIAS_UPDATED = 'System alias updated.'

  static SYSTEM_NOT_UPDATED = 'System not updated.'

  static SYSTEM_NOT_FOUND = 'System not found.'

  static SYSTEM_HISTORY_NOT_UPDATED = 'Message is the same as the current system history record.'

  static SYSTEM_HISTORY_SYSTEM_FACTION_NOT_FOUND(systemFaction: string) {
    return `Unable to find the faction record for the faction ${systemFaction}.`
  }

  static SYSTEM_HISTORY_OLDER = 'Message is older than the latest record.'

  static SYSTEM_HISTORY_CACHED = 'Message is probably cached.'

  static SYSTEM_HISTORY_CREATED = 'System history created.'

  static FACTION_CREATED(faction: string) {
    return `Faction created: ${faction}`
  }

  static FACTION_NOT_UPDATED(faction: string) {
    return `Faction not updated: ${faction}`
  }

  static SYSTEM_FACTION_HISTORY_CACHED(faction: string) {
    return `System faction history is probably cached: ${faction}`
  }

  static SYSTEM_FACTION_HISTORY_CLOSED(faction: string) {
    return `System faction history closed: ${faction}`
  }

  static SYSTEM_FACTION_HISTORY_CREATED(faction: string) {
    return `System faction history created: ${faction}`
  }

  static SYSTEM_FACTION_HISTORY_NOT_UPDATED = (faction: string) => {
    return `Faction in message is the same as the current system faction history record: ${faction}`
  }

  static SYSTEM_FACTION_HISTORY_OLDER = (faction: string) => {
    return `Message is older than the latest record: ${faction}`
  }
}
