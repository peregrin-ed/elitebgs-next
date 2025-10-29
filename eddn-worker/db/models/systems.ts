import type {
  CreationOptional,
  HasManyCreateAssociationMixin,
  HasManyGetAssociationsMixin,
  InferAttributes,
  InferCreationAttributes,
  NonAttribute,
} from 'sequelize'
import { DataTypes, Model, Sequelize } from 'sequelize'
import { type PointWCrs } from '@elitebgs/types/geoJson.ts'
import { SystemAliases } from './system_aliases.ts'
import { SystemHistories } from './system_histories.ts'
import { SystemFactionHistories } from './system_faction_histories.ts'
import { Stations } from './stations.ts'

export class Systems extends Model<
  InferAttributes<Systems>,
  InferCreationAttributes<Systems>
> {
  declare id: CreationOptional<string>
  declare starSystem: string
  declare starSystemLower: string
  declare systemAddress: string
  declare starPos: PointWCrs

  declare createdAt: CreationOptional<Date>
  declare updatedAt: CreationOptional<Date>

  declare SystemAliases?: NonAttribute<SystemAliases[]>
  declare createSystemAlias: HasManyCreateAssociationMixin<SystemAliases, 'systemId'>

  declare getSystemHistories: HasManyGetAssociationsMixin<SystemHistories>
  declare createSystemHistory: HasManyCreateAssociationMixin<SystemHistories, 'systemId'>

  declare getSystemFactionHistories: HasManyGetAssociationsMixin<SystemFactionHistories>
  declare createSystemFactionHistory: HasManyCreateAssociationMixin<SystemFactionHistories, 'systemId'>

  declare getStations: HasManyGetAssociationsMixin<Stations>
  declare createStation: HasManyCreateAssociationMixin<Stations, 'systemId'>

}

export function SystemsInit(sequelize: Sequelize) {
  Systems.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      starSystem: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      starSystemLower: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      systemAddress: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      starPos: {
        type: DataTypes.GEOMETRY('POINTZ', 0),
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
      tableName: 'systems',
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ['system_address'],
        },
      ],
    },
  )
}
