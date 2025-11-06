import type { CreationOptional, InferAttributes, InferCreationAttributes, ForeignKey } from 'sequelize'
import { DataTypes, Model, Sequelize } from 'sequelize'
import { SystemFactionHistories } from './system_faction_histories.ts'

export class RecoveringStates extends Model<
  InferAttributes<RecoveringStates>,
  InferCreationAttributes<RecoveringStates>
> {
  declare id: CreationOptional<string>
  declare state: string
  declare trend: number
  declare systemFactionHistoryId: ForeignKey<SystemFactionHistories['id']>

  declare createdAt: CreationOptional<Date>
  declare updatedAt: CreationOptional<Date>
}

export function RecoveringStatesInit(sequelize: Sequelize) {
  RecoveringStates.init(
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
      trend: {
        type: DataTypes.DECIMAL,
        allowNull: false,
        get() {
          return parseInt(this.getDataValue('trend').toString())
        },
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
    { sequelize, tableName: 'recovering_states', underscored: true },
  )
}
