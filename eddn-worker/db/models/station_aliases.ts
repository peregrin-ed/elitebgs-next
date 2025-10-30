import type { CreationOptional, InferAttributes, InferCreationAttributes, ForeignKey } from 'sequelize'
import { DataTypes, Model, Sequelize } from 'sequelize'
import { Stations } from './stations.ts'

export class StationAliases extends Model<InferAttributes<StationAliases>, InferCreationAttributes<StationAliases>> {
  declare id: CreationOptional<string>
  declare stationId: ForeignKey<Stations['id']>
  declare alias: string
  declare aliasLower: string

  declare createdAt: CreationOptional<Date>
  declare updatedAt: CreationOptional<Date>
}

export function StationAliasesInit(sequelize: Sequelize) {
  StationAliases.init(
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
      alias: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      aliasLower: {
        type: DataTypes.STRING,
        allowNull: false,
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
      tableName: 'station_aliases',
      underscored: true,
    },
  )
}
