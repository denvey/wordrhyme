import {
  EDBEntity,
  getRandStr,
  getStoreItem,
  TBaseFilter,
  TBasePageEntity,
  TDeleteManyInput,
  TPagedList,
  TPagedParams,
} from '@cromwell/core';
import { HttpException, HttpStatus } from '@nestjs/common';
import {
  ConnectionOptions,
  DeepPartial,
  DeleteQueryBuilder,
  getConnection,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';

import { applyBaseFilter, getPaged, getSqlBoolStr, getSqlLike, wrapInQuotes } from '../helpers/base-queries';
import { entityMetaRepository } from '../helpers/entity-meta';
import { getLogger } from '../helpers/logger';
import { PageStats } from '../models/entities/page-stats.entity';

const logger = getLogger();

export class BaseRepository<
  EntityType extends { id?: number | undefined },
  EntityInputType extends object = EntityType,
> extends Repository<EntityType> {
  public dbType: ConnectionOptions['type'];

  constructor(private EntityClass: new (...args: any[]) => EntityType & { id?: number }) {
    super();
    this.dbType = (getStoreItem('dbInfo')?.dbType as ConnectionOptions['type']) ?? getConnection().options.type;
  }

  getSqlBoolStr = (b: boolean) => getSqlBoolStr(this.dbType, b);
  getSqlLike = () => getSqlLike(this.dbType);
  quote = (str: string) => wrapInQuotes(this.dbType, str);

  async getPaged(params?: TPagedParams<EntityType>): Promise<TPagedList<EntityType>> {
    const qb = this.createQueryBuilder(this.metadata.tablePath);
    return await getPaged(qb, this.metadata.tablePath, params);
  }

  async getAll(): Promise<EntityType[]> {
    return this.find();
  }

  async getById(id: number, relations?: string[]): Promise<EntityType> {
    const entity = await this.findOne({
      where: { id },
      relations,
    });

    if (!entity) throw new HttpException(`${this.metadata.tablePath} ${id} not found!`, HttpStatus.NOT_FOUND);
    return entity;
  }

  async getBySlug(slug: string, relations?: string[]): Promise<EntityType> {
    const entity = await this.findOne({
      where: { slug },
      relations,
    });
    if (!entity) throw new HttpException(`${this.metadata.tablePath} ${slug} not found!`, HttpStatus.NOT_FOUND);
    return entity;
  }

  async createEntity(input: EntityInputType, id?: number | null): Promise<EntityType> {
    const entity = new this.EntityClass();
    if (id) entity.id = id;

    for (const key of Object.keys(input)) {
      entity[key] = input[key];
    }
    return await this.save(entity as DeepPartial<EntityType>);
  }

  async updateEntity(id: number, input: EntityInputType): Promise<EntityType> {
    const entity = await this.findOne({
      where: { id },
    });
    if (!entity) throw new HttpException(`${this.metadata.tablePath} ${id} not found!`, HttpStatus.NOT_FOUND);

    for (const key of Object.keys(input)) {
      entity[key] = input[key];
    }
    return await this.save(entity as DeepPartial<EntityType>);
  }

  async deleteEntity(id: number): Promise<boolean> {
    const entity = await this.getById(id);
    if (!entity) {
      logger.error(`BaseRepository::deleteEntity failed to find ${this.metadata.tablePath} ${id} by id: ${id}`);
      return false;
    }
    await this.delete(id);
    return true;
  }

  async applyDeleteMany(qb: SelectQueryBuilder<EntityType> | DeleteQueryBuilder<EntityType>, input: TDeleteManyInput) {
    if (input.all) {
      if (input.ids?.length) {
        qb.andWhere(`${this.metadata.tablePath}.id NOT IN (:...ids)`, { ids: input.ids ?? [] });
      } else {
        // no WHERE needed
      }
    } else {
      if (input.ids?.length) {
        input.ids = input.ids.filter(Boolean).filter((id) => typeof id === 'number');
        qb.andWhere(`${this.metadata.tablePath}.id IN (:...ids)`, { ids: input.ids ?? [] });
      } else {
        throw new HttpException(
          `applyDeleteMany: You have to specify ids to delete for ${this.metadata.tablePath}`,
          HttpStatus.BAD_REQUEST,
        );
      }
    }
  }

  async deleteMany(input: TDeleteManyInput) {
    const qb = this.createQueryBuilder().delete().from<EntityType>(this.metadata.tablePath);
    this.applyDeleteMany(qb, input);
    await qb.execute();
    return true;
  }

  applyGetEntityViews(qb: SelectQueryBuilder<TBasePageEntity>, entityType: EDBEntity) {
    const statsTable = PageStats.getRepository().metadata.tablePath;
    const entityTypeKey = 'entityType' + getRandStr(4);
    qb.addSelect(`${statsTable}.views`, this.metadata.tablePath + '_' + 'views')
      .leftJoin(
        PageStats,
        statsTable,
        `${statsTable}.${this.quote('slug')} = ${this.metadata.tablePath}.slug ` +
          `AND ${statsTable}.${this.quote('entityType')} = :${entityTypeKey}`,
      )
      .setParameter(entityTypeKey, entityType);
    return qb;
  }

  async getEntityViews(entityId: number, entityType: EDBEntity) {
    const qb: SelectQueryBuilder<TBasePageEntity> = this.createQueryBuilder(this.metadata.tablePath).select([
      `${this.metadata.tablePath}.id`,
    ]) as any;

    this.applyGetEntityViews(qb, entityType).where(`${this.metadata.tablePath}.id = :entityId`, { entityId });

    const entity = await qb.getRawOne();
    return entity?.[this.metadata.tablePath + '_' + 'views'];
  }

  applyBaseFilter<EntityType = TBasePageEntity>(
    qb: SelectQueryBuilder<EntityType>,
    filter?: TBaseFilter,
  ): SelectQueryBuilder<EntityType> {
    if (!filter) return qb;
    const entityType = entityMetaRepository.getEntityType(this.EntityClass);
    return applyBaseFilter({
      qb,
      filter,
      dbType: this.dbType,
      entityType,
      EntityClass: this.EntityClass as any,
    });
  }

  async getFilteredEntities(pagedParams?: TPagedParams<EntityType>, filterParams?: TBaseFilter) {
    const qb = this.createQueryBuilder(this.metadata.tablePath).select();
    this.applyBaseFilter(qb, filterParams);
    return await getPaged<EntityType>(qb, this.metadata.tablePath, pagedParams);
  }
}
