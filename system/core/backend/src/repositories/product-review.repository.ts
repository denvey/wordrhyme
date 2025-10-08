import {
  TDeleteManyInput,
  TPagedList,
  TPagedParams,
  TProductReview,
  TProductReviewFilter,
  TProductReviewInput,
} from '@cromwell/core';
import { HttpException, HttpStatus } from '@nestjs/common';
import sanitizeHtml from 'sanitize-html';
import { Brackets, EntityRepository, getCustomRepository, SelectQueryBuilder } from 'typeorm';

import { checkEntitySlug, getPaged, handleBaseInput, handleCustomMetaInput } from '../helpers/base-queries';
import { getLogger } from '../helpers/logger';
import { ProductReview } from '../models/entities/product-review.entity';
import { BaseRepository } from './base.repository';
import { ProductRepository } from './product.repository';

const logger = getLogger();

@EntityRepository(ProductReview)
export class ProductReviewRepository extends BaseRepository<ProductReview> {
  private productRepo = getCustomRepository(ProductRepository);

  constructor() {
    super(ProductReview);
  }

  async getProductReviews(params?: TPagedParams<TProductReview>): Promise<TPagedList<ProductReview>> {
    return getPaged<ProductReview>(this.createQueryBuilder(this.metadata.tablePath), this.metadata.tablePath, params);
  }

  async getProductReview(id: number): Promise<ProductReview> {
    return this.getById(id);
  }

  async handleProductReviewInput(
    productReview: ProductReview,
    input: TProductReviewInput,
    action: 'update' | 'create',
  ) {
    await handleBaseInput(productReview, input);

    const product = input.productId && (await this.productRepo.getProductById(input.productId));
    if (!product) throw new HttpException(`ProductReview ${input.productId} not found!`, HttpStatus.NOT_FOUND);
    productReview.product = product;

    productReview.title = input.title
      ? sanitizeHtml(input.title, {
          allowedTags: [],
        })
      : input.title;
    productReview.description = input.description
      ? sanitizeHtml(input.description, {
          allowedTags: [],
        })
      : input.description;
    productReview.rating = input.rating;
    productReview.userName = input.userName
      ? sanitizeHtml(input.userName, {
          allowedTags: [],
        })
      : input.userName;
    productReview.approved = input.approved;
    productReview.userId = input.userId;

    if (action === 'create') await productReview.save();
    await checkEntitySlug(productReview, ProductReview);
    await handleCustomMetaInput(productReview, input);
  }

  async createProductReview(createProductReview: TProductReviewInput, id?: number | null): Promise<ProductReview> {
    const productReview = new ProductReview();
    if (id) productReview.id = id;

    await this.handleProductReviewInput(productReview, createProductReview, 'create');
    await this.save(productReview);

    return productReview;
  }

  async updateProductReview(id: number, updateProductReview: TProductReviewInput): Promise<ProductReview> {
    const productReview = await this.getById(id);

    await this.handleProductReviewInput(productReview, updateProductReview, 'update');
    await this.save(productReview);
    return productReview;
  }

  async deleteProductReview(id: number): Promise<boolean> {
    const productReview = await this.getProductReview(id);
    if (!productReview) {
      return false;
    }
    await this.delete(id);
    return true;
  }

  applyProductReviewFilter(qb: SelectQueryBuilder<TProductReview>, filterParams?: TProductReviewFilter) {
    this.applyBaseFilter(qb, filterParams);

    // Search by approved
    if (filterParams?.approved !== undefined && filterParams?.approved !== null) {
      if (filterParams.approved) {
        qb.andWhere(`${this.metadata.tablePath}.approved = ${this.getSqlBoolStr(true)}`);
      }

      if (filterParams?.approved === false) {
        const brackets = new Brackets((subQb) => {
          subQb.where(`${this.metadata.tablePath}.approved = ${this.getSqlBoolStr(false)}`);
          subQb.orWhere(`${this.metadata.tablePath}.approved IS NULL`);
        });
        qb.andWhere(brackets);
      }
    }

    // Search by productId
    if (filterParams?.productId !== undefined && filterParams?.productId !== null) {
      const query = `${this.metadata.tablePath}.${this.quote('productId')} = :productId`;
      qb.andWhere(query, { productId: filterParams.productId });
    }

    // Search by userId
    if (filterParams?.userId) {
      const query = `${this.metadata.tablePath}.${this.quote('userId')} = :userId`;
      qb.andWhere(query, { userId: filterParams.userId });
    }

    // Search by userName
    if (filterParams?.userName) {
      const userNameSearch = `%${filterParams.userName}%`;
      const query = `${this.metadata.tablePath}.${this.quote('userName')} ${this.getSqlLike()} :userNameSearch`;
      qb.andWhere(query, { userNameSearch });
    }
  }

  async getFilteredProductReviews(
    pagedParams?: TPagedParams<TProductReview>,
    filterParams?: TProductReviewFilter,
  ): Promise<TPagedList<TProductReview>> {
    const qb = this.createQueryBuilder(this.metadata.tablePath);
    qb.select();
    this.applyProductReviewFilter(qb, filterParams);
    return await getPaged<TProductReview>(qb, this.metadata.tablePath, pagedParams);
  }

  async deleteManyFilteredProductReviews(
    input: TDeleteManyInput,
    filterParams?: TProductReviewFilter,
  ): Promise<boolean> {
    if (!filterParams) return this.deleteMany(input);

    const qbSelect = this.createQueryBuilder(this.metadata.tablePath).select([`${this.metadata.tablePath}.id`]);
    this.applyProductReviewFilter(qbSelect, filterParams);
    this.applyDeleteMany(qbSelect, input);

    const qbDelete = this.createQueryBuilder(this.metadata.tablePath)
      .delete()
      .where(`${this.metadata.tablePath}.id IN (${qbSelect.getQuery()})`)
      .setParameters(qbSelect.getParameters());

    await qbDelete.execute();
    return true;
  }
}
