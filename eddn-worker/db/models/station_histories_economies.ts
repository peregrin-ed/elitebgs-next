import type { CreationOptional, ForeignKey, InferAttributes, InferCreationAttributes } from 'sequelize'
import { DataTypes, Model, Sequelize } from 'sequelize'
import { StationHistories } from './station_histories.ts'

export class StationHistoriesEconomies extends Model<InferAttributes<StationHistoriesEconomies>, InferCreationAttributes<StationHistoriesEconomies>> {
  declare id: CreationOptional<string>
  declare stationHistoryId: ForeignKey<StationHistories['id']>
  declare name: string
  declare proportion: number
}

export function StationHistoriesEconomiesInit(sequelize: Sequelize) {
  StationHistoriesEconomies.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      stationHistoryId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      proportion: {
        type: DataTypes.DECIMAL,
        allowNull: false,
      }
    },
    {
      sequelize,
      tableName: 'station_histories_economies',
      underscored: true,
      timestamps: false,
    },
  )
}
