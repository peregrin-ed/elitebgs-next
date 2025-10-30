import type { CreationOptional, ForeignKey, InferAttributes, InferCreationAttributes } from 'sequelize'
import { DataTypes, Model, Sequelize } from 'sequelize'
import { StationHistories } from './station_histories.ts'

export class StationHistoriesServices extends Model<InferAttributes<StationHistoriesServices>, InferCreationAttributes<StationHistoriesServices>> {
  declare id: CreationOptional<string>
  declare stationHistoryId: ForeignKey<StationHistories['id']>
  declare name: string
}

export function StationHistoriesServicesInit(sequelize: Sequelize) {
  StationHistoriesServices.init(
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
      }
    },
    {
      sequelize,
      tableName: 'station_histories_services',
      underscored: true,
      timestamps: false,
    },
  )
}
