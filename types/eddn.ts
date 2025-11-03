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

export enum JournalEvents {
  FSDJump = 'FSDJump',
  Location = 'Location',
  Docked = 'Docked',
}

export type JournalMessage = EDDNBase & {
  message: {
    event: JournalEvents,
    timestamp: Date,
    StarSystem: string,
    // TODO: This attribute was in the SystemMessage - we need to support journals without this property from before
    //  approx January 2019 (date to be confirmed)
    SystemAddress: number
  }
}

export type SystemMessage = JournalMessage & {
  message: {
    StarPos: number[]
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

export type StationMessage = JournalMessage & {
  message: {
    MarketID?: number
    DistFromStarLS?: number
    StationAllegiance?: string
    StationEconomies?: StationEconomy[]
    StationEconomy?: string
    StationFaction?: SystemFaction
    StationGovernment?: string
    StationName?: string
    StationServices?: string[]
    StationType?: string
  }
}

export type Location = SystemMessage & StationMessage & {
  message: {
    event: JournalEvents.Location
    Docked: boolean
  }
}

export type ConflictFaction = {
  Name: string
  Stake: string
  WonDaysAgo: number
}

export type FactionConflict = {
  WarType: string
  Status: string
  Faction1: ConflictFaction
}

export type PowerplayConflict = {
  Power: string
  ConflictProgress: number
}

export type StationEconomy = {
  Name: string
  Proportion: number
}

export type State = {
  State: string
  Trend: number
}

export type SystemFaction = {
  Name: string
  FactionState: string
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
