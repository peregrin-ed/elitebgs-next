import type {
  CreationOptional,
  ForeignKey,
  HasManyCreateAssociationMixin,
  InferAttributes,
  InferCreationAttributes,
  NonAttribute,
} from 'sequelize'
import { DataTypes, Model, Sequelize } from 'sequelize'
import { Systems } from './systems.ts'
import { Factions } from './factions.ts'
import { ActiveStates } from './active_states.ts'
import { PendingStates } from './pending_states.ts'
import { RecoveringStates } from './recovering_states.ts'

export class SystemFactionHistories extends Model<
  InferAttributes<SystemFactionHistories>,
  InferCreationAttributes<SystemFactionHistories>
> {
  declare id: CreationOptional<string>
  declare systemId: ForeignKey<Systems['id']>
  declare factionId: ForeignKey<Factions['id']>
  declare factionState: string
  declare influence: number
  declare happiness: string
  declare validFrom: Date
  declare validTo: Date

  declare createdAt: CreationOptional<Date>
  declare updatedAt: CreationOptional<Date>

  declare ActiveStates?: NonAttribute<ActiveStates[]>
  declare PendingStates?: NonAttribute<PendingStates[]>
  declare RecoveringStates?: NonAttribute<RecoveringStates[]>

  declare createActiveState: HasManyCreateAssociationMixin<ActiveStates, 'systemFactionHistoryId'>
  declare createPendingState: HasManyCreateAssociationMixin<PendingStates, 'systemFactionHistoryId'>
  declare createRecoveringState: HasManyCreateAssociationMixin<RecoveringStates, 'systemFactionHistoryId'>
}

export function SystemFactionHistoriesInit(sequelize: Sequelize) {
  SystemFactionHistories.init(
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
      factionId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      factionState: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      influence: {
        type: DataTypes.DECIMAL,
        allowNull: false,
        get() {
          return parseFloat(this.getDataValue('influence').toString())
        },
      },
      happiness: {
        type: DataTypes.STRING,
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
    { sequelize, tableName: 'system_faction_histories', underscored: true },
  )
}
