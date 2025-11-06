import type { CreationOptional, InferAttributes, InferCreationAttributes, ForeignKey } from 'sequelize'
import { DataTypes, Model, Sequelize } from 'sequelize'
import { SystemFactionHistories } from './system_faction_histories.ts'

export class ActiveStates extends Model<InferAttributes<ActiveStates>, InferCreationAttributes<ActiveStates>> {
  declare id: CreationOptional<string>
  declare state: string
  declare systemFactionHistoryId: ForeignKey<SystemFactionHistories['id']>

  declare createdAt: CreationOptional<Date>
  declare updatedAt: CreationOptional<Date>
}

export function ActiveStatesInit(sequelize: Sequelize) {
  ActiveStates.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      systemFactionHistoryId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      state: {
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
    { sequelize, tableName: 'active_states', underscored: true },
  )
}
