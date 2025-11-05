import type {
  CreationOptional,
  ForeignKey,
  HasManyCreateAssociationMixin,
  HasManyGetAssociationsMixin,
  InferAttributes,
  InferCreationAttributes,
} from 'sequelize'
import { DataTypes, Model, Sequelize } from 'sequelize'
import { Stations } from './stations.ts'
import { Factions } from './factions.ts'
import { StationHistoriesServices } from './station_histories_services.ts'
import { StationHistoriesEconomies } from './station_histories_economies.ts'

export class StationHistories extends Model<InferAttributes<StationHistories>, InferCreationAttributes<StationHistories>> {
  declare id: CreationOptional<string>
  declare stationId: ForeignKey<Stations['id']>
  declare distanceFromStar: number
  declare stationAllegiance: string
  declare stationEconomy: string
  declare stationGovernment: string
  declare stationType: string
  declare stationFactionId: ForeignKey<Factions['id']>
  declare stationFactionState: string
  declare validFrom: Date
  declare validTo: Date

  declare createdAt: CreationOptional<Date>
  declare updatedAt: CreationOptional<Date>

  declare StationHistoriesServices?: HasManyGetAssociationsMixin<StationHistoriesServices[]>
  declare createStationHistoriesService: HasManyCreateAssociationMixin<StationHistoriesServices, 'stationHistoryId'>

  declare StationHistoriesEconomies?: HasManyGetAssociationsMixin<StationHistoriesEconomies[]>
  declare createStationHistoriesEconomy: HasManyCreateAssociationMixin<StationHistoriesEconomies, 'stationHistoryId'>
}

export function StationHistoriesInit(sequelize: Sequelize) {
  StationHistories.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      stationId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      distanceFromStar: {
        type: DataTypes.DECIMAL,
        allowNull: false,
        get() {
          return parseFloat(this.getDataValue('distanceFromStar').toString())
        },
      },
      stationAllegiance: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      stationEconomy: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      stationGovernment: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      stationType: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      stationFactionId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      stationFactionState: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      validFrom: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      validTo: {
        type: DataTypes.DATE,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    },
    {
      sequelize,
      tableName: 'station_histories',
      underscored: true,
      indexes: [
        {
          fields: ['valid_from'],
        },
      ],
    },
  )
}
