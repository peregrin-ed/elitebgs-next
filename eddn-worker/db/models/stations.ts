import type {
  CreationOptional,
  ForeignKey,
  HasManyCreateAssociationMixin,
  HasManyGetAssociationsMixin,
  InferAttributes,
  InferCreationAttributes,
  NonAttribute,
} from 'sequelize'
import { DataTypes, Model, Sequelize } from 'sequelize'
import { Systems } from './systems.ts'
import { StationAliases } from './station_aliases.ts'
import { StationHistories } from './station_histories.ts'

export class Stations extends Model<
  InferAttributes<Stations>,
  InferCreationAttributes<Stations>
> {
  declare id: CreationOptional<string>
  declare systemId: ForeignKey<Systems['id']>
  declare stationName: string
  declare stationNameLower: string
  declare marketId: string
  declare distanceFromStar: number

  declare createdAt: CreationOptional<Date>
  declare updatedAt: CreationOptional<Date>

  declare StationAliases?: NonAttribute<StationAliases[]>
  declare createStationAlias: HasManyCreateAssociationMixin<StationAliases, 'stationId'>

  declare getStationHistories: HasManyGetAssociationsMixin<StationHistories>
  declare createStationHistory: HasManyCreateAssociationMixin<StationHistories, 'stationId'>

}

export function StationsInit(sequelize: Sequelize) {
  Stations.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      systemId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      stationName: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      stationNameLower: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      marketId: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      distanceFromStar: {
        type: DataTypes.INTEGER,
        allowNull: false,
        get() {
          return parseInt(this.getDataValue('distanceFromStar').toString())
        },
      },
      // Needed to mute the typing error as sequelize can't figure it out.
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
      tableName: 'stations',
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ['market_id'],
        },
      ],
    },
  )
}
