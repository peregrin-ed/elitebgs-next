import type {
  CreationOptional,
  HasManyCreateAssociationMixin,
  HasManyGetAssociationsMixin,
  InferAttributes,
  InferCreationAttributes,
  NonAttribute,
} from 'sequelize'
import { DataTypes, Model, Sequelize } from 'sequelize'
import { SystemAliases } from './system_aliases.ts'
import { SystemHistories } from './system_histories.ts'
import { SystemFactionHistories } from './system_faction_histories.ts'

export class Stations extends Model<
  InferAttributes<Stations>,
  InferCreationAttributes<Stations>
> {
  declare id: CreationOptional<string>
  declare station: string
  declare stationLower: string
  declare marketId: string // TODO: Is this the unique ID for the station?
 // declare systemAddress: string
 // declare starPos: PointWCrs

  declare createdAt: CreationOptional<Date>
  declare updatedAt: CreationOptional<Date>

  declare SystemAliases?: NonAttribute<SystemAliases[]>
  declare createSystemAlias: HasManyCreateAssociationMixin<SystemAliases, 'systemId'>

  declare getSystemHistories: HasManyGetAssociationsMixin<SystemHistories>
  declare createSystemHistory: HasManyCreateAssociationMixin<SystemHistories, 'systemId'>

  declare getSystemFactionHistories: HasManyGetAssociationsMixin<SystemFactionHistories>
  declare createSystemFactionHistory: HasManyCreateAssociationMixin<SystemFactionHistories, 'systemId'>
}

export function StationsInit(sequelize: Sequelize) {
  Stations.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      station: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      stationLower: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      marketId: {
        type: DataTypes.STRING,
        allowNull: false,
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
      // TODO: Establish what indexes are needed
      /*
      indexes: [
        {
          unique: true,
          fields: ['system_address'],
        },
      ],
       */
    },
  )
}
