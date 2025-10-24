export type EDDNBase = {
  $schemaRef: string
  header: {
    gameversion: string
    gamebuild: string
    gatewayTimestamp: Date
    softwareName: string
    softwareVersion: string
    uploaderID: string
  }
  message: unknown
}

export type JournalMessage = EDDNBase & {
  message: {
    event: JournalEvents,
    timestamp: Date,
    StarSystem: string,
    StarPos: number[]
    // Todo: Add SystemAddress here once the import for January 2019 is done.
  }
}

export enum JournalEvents {
  FSDJump = 'FSDJump',
  Location = 'Location',
}

export type SystemMessage = JournalMessage & {
  message: {
    SystemAddress: number
    SystemAllegiance: string
    SystemEconomy: string
    SystemSecondEconomy: string
    SystemGovernment: string
    SystemSecurity: string
    Population: number
    Factions?: Faction[]
    SystemFaction?: SystemFaction
    Powers?: string[]
    ControllingPower?: string
    PowerplayState?: string
    PowerplayStateControlProgress?: number
    PowerplayStateReinforcement?: number
    PowerplayStateUndermining?: number
    PowerplayConflictProgress?: PowerplayConflict[]
    Conflicts?: FactionConflict[]
  }
}

export type FSDJump = SystemMessage & {
    message: {
        event: JournalEvents.FSDJump
    }
}

export type FactionConflict = {
  WarType: string
  Status: string
  Faction1: ConflictFaction
}

export type ConflictFaction = {
  Name: string
  Stake: string
  WonDaysAgo: number
}

export type PowerplayConflict = {
  Power: string
  ConflictProgress: number
}

export type SystemFaction = {
  Name: string
  FactionState: string
}

export type Location = SystemMessage & {
    message: {
        event: JournalEvents.Location
    }
}

export type Faction = SystemFaction & {
  Influence: number
  Government: string
  Allegiance: string
  Happiness: string
  ActiveStates?: State[]
  PendingStates?: State[]
  RecoveringStates?: State[]
}

export type State = {
  State: string
  Trend: number
}
