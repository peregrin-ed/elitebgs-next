import type {
  CreationOptional,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
} from 'sequelize'
import { DataTypes, Model, Sequelize } from 'sequelize'
import { Systems } from './systems.ts'

export class Stations extends Model<
  InferAttributes<Stations>,
  InferCreationAttributes<Stations>
> {
  declare id: CreationOptional<string>
  declare systemId: ForeignKey<Systems['id']>
  declare station: string
  declare stationLower: string
  declare marketId: string

  declare createdAt: CreationOptional<Date>
  declare updatedAt: CreationOptional<Date>

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
      indexes: [
        {
          unique: true,
          fields: ['market_id'],
        },
      ],
    },
  )
}
