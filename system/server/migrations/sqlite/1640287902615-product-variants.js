const { MigrationInterface, QueryRunner } = require('typeorm');

module.exports = class productVariants1640287902615 {
  name = 'productVariants1640287902615';

  async up(queryRunner) {
    await queryRunner.query(
      `CREATE TABLE "crw_product_variant_meta" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "key" varchar(255), "value" text, "shortValue" varchar(255), "entityId" integer NOT NULL)`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_043b6fccace5ccd18abcd0472d" ON "crw_product_variant_meta" ("key") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_5d353c6757ba25557fcaa97b16" ON "crw_product_variant_meta" ("shortValue") `,
    );
    await queryRunner.query(
      `CREATE TABLE "crw_product_variant" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "slug" varchar(255), "pageTitle" varchar(2000), "pageDescription" varchar(4000), "_meta" text, "createDate" datetime NOT NULL DEFAULT (datetime('now')), "updateDate" datetime NOT NULL DEFAULT (datetime('now')), "isEnabled" boolean DEFAULT (1), "productId" integer NOT NULL, "name" varchar(255), "price" float, "oldPrice" float, "sku" varchar(255), "mainImage" varchar(400), "images" text, "stockAmount" integer, "stockStatus" varchar(255), "manageStock" boolean, "description" text, "descriptionDelta" text, "attributesJson" text, CONSTRAINT "UQ_c7c9273af9577aa30bb613bfe53" UNIQUE ("slug"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_4f0d03313fc011fd0cdf8db5a8" ON "crw_product_variant" ("createDate") `);
    await queryRunner.query(`CREATE INDEX "IDX_57a78fa5ef24fa0ea0fa33a74e" ON "crw_product_variant" ("updateDate") `);
    await queryRunner.query(`CREATE INDEX "IDX_d56c009fabddf3cf7a7b54210b" ON "crw_product_variant" ("name") `);
    await queryRunner.query(`CREATE INDEX "IDX_36939bbe847d64f4b78f3b5234" ON "crw_product_variant" ("price") `);
    await queryRunner.query(`CREATE INDEX "IDX_4676dd0b234c31f55656eb82b5" ON "crw_product_variant" ("oldPrice") `);
    await queryRunner.query(`CREATE INDEX "IDX_9ae265ee4eb7735d7f0f2eb84d" ON "crw_product_variant" ("sku") `);
    await queryRunner.query(`CREATE INDEX "IDX_421fcfb5bf7bf531646dcd52ab" ON "crw_product_variant" ("stockAmount") `);
    await queryRunner.query(`CREATE INDEX "IDX_e34d9eb5816f615f44218fe5c2" ON "crw_product_variant" ("stockStatus") `);
    await queryRunner.query(`DROP INDEX "IDX_77dc2abc46299b49ead89048d4"`);
    await queryRunner.query(`DROP INDEX "IDX_5adfdd26419d9b737b683a8c65"`);
    await queryRunner.query(`DROP INDEX "IDX_c717d9265ea3490790ee35edcd"`);
    await queryRunner.query(`DROP INDEX "IDX_fbee175d8049460160e35a36ba"`);
    await queryRunner.query(`DROP INDEX "IDX_a4383ddcc0498cfacd641f9cf8"`);
    await queryRunner.query(`DROP INDEX "IDX_c07a670f3308a2db7824d76d6a"`);
    await queryRunner.query(`DROP INDEX "IDX_e734039ba75ee043d3c61466de"`);
    await queryRunner.query(`DROP INDEX "IDX_519eaf50959bea415509872bb9"`);
    await queryRunner.query(`DROP INDEX "IDX_a51cbca1c3ed52d289104a4029"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_crw_product" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "slug" varchar(255), "pageTitle" varchar(2000), "pageDescription" varchar(4000), "_meta" text, "createDate" datetime NOT NULL DEFAULT (datetime('now')), "updateDate" datetime NOT NULL DEFAULT (datetime('now')), "isEnabled" boolean DEFAULT (1), "name" varchar(255), "mainCategoryId" integer, "price" float, "oldPrice" float, "sku" varchar(255), "mainImage" varchar(400), "images" text, "stockAmount" integer, "stockStatus" varchar(255), "description" text, "descriptionDelta" text, "averageRating" decimal, "reviewsCount" integer, "manageStock" boolean, CONSTRAINT "UQ_404785f00e4d88df4fa5783830b" UNIQUE ("slug"))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_crw_product"("id", "slug", "pageTitle", "pageDescription", "_meta", "createDate", "updateDate", "isEnabled", "name", "mainCategoryId", "price", "oldPrice", "sku", "mainImage", "images", "stockAmount", "stockStatus", "description", "descriptionDelta", "averageRating", "reviewsCount") SELECT "id", "slug", "pageTitle", "pageDescription", "_meta", "createDate", "updateDate", "isEnabled", "name", "mainCategoryId", "price", "oldPrice", "sku", "mainImage", "images", "stockAmount", "stockStatus", "description", "descriptionDelta", "averageRating", "reviewsCount" FROM "crw_product"`,
    );
    await queryRunner.query(`DROP TABLE "crw_product"`);
    await queryRunner.query(`ALTER TABLE "temporary_crw_product" RENAME TO "crw_product"`);
    await queryRunner.query(`CREATE INDEX "IDX_77dc2abc46299b49ead89048d4" ON "crw_product" ("stockStatus") `);
    await queryRunner.query(`CREATE INDEX "IDX_5adfdd26419d9b737b683a8c65" ON "crw_product" ("stockAmount") `);
    await queryRunner.query(`CREATE INDEX "IDX_c717d9265ea3490790ee35edcd" ON "crw_product" ("sku") `);
    await queryRunner.query(`CREATE INDEX "IDX_fbee175d8049460160e35a36ba" ON "crw_product" ("oldPrice") `);
    await queryRunner.query(`CREATE INDEX "IDX_a4383ddcc0498cfacd641f9cf8" ON "crw_product" ("price") `);
    await queryRunner.query(`CREATE INDEX "IDX_c07a670f3308a2db7824d76d6a" ON "crw_product" ("mainCategoryId") `);
    await queryRunner.query(`CREATE INDEX "IDX_e734039ba75ee043d3c61466de" ON "crw_product" ("name") `);
    await queryRunner.query(`CREATE INDEX "IDX_519eaf50959bea415509872bb9" ON "crw_product" ("updateDate") `);
    await queryRunner.query(`CREATE INDEX "IDX_a51cbca1c3ed52d289104a4029" ON "crw_product" ("createDate") `);
    await queryRunner.query(`DROP INDEX "IDX_043b6fccace5ccd18abcd0472d"`);
    await queryRunner.query(`DROP INDEX "IDX_5d353c6757ba25557fcaa97b16"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_crw_product_variant_meta" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "key" varchar(255), "value" text, "shortValue" varchar(255), "entityId" integer NOT NULL, CONSTRAINT "FK_f2833cc1e1bb9516471b126327e" FOREIGN KEY ("entityId") REFERENCES "crw_product_variant" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_crw_product_variant_meta"("id", "key", "value", "shortValue", "entityId") SELECT "id", "key", "value", "shortValue", "entityId" FROM "crw_product_variant_meta"`,
    );
    await queryRunner.query(`DROP TABLE "crw_product_variant_meta"`);
    await queryRunner.query(`ALTER TABLE "temporary_crw_product_variant_meta" RENAME TO "crw_product_variant_meta"`);
    await queryRunner.query(`CREATE INDEX "IDX_043b6fccace5ccd18abcd0472d" ON "crw_product_variant_meta" ("key") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_5d353c6757ba25557fcaa97b16" ON "crw_product_variant_meta" ("shortValue") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_4f0d03313fc011fd0cdf8db5a8"`);
    await queryRunner.query(`DROP INDEX "IDX_57a78fa5ef24fa0ea0fa33a74e"`);
    await queryRunner.query(`DROP INDEX "IDX_d56c009fabddf3cf7a7b54210b"`);
    await queryRunner.query(`DROP INDEX "IDX_36939bbe847d64f4b78f3b5234"`);
    await queryRunner.query(`DROP INDEX "IDX_4676dd0b234c31f55656eb82b5"`);
    await queryRunner.query(`DROP INDEX "IDX_9ae265ee4eb7735d7f0f2eb84d"`);
    await queryRunner.query(`DROP INDEX "IDX_421fcfb5bf7bf531646dcd52ab"`);
    await queryRunner.query(`DROP INDEX "IDX_e34d9eb5816f615f44218fe5c2"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_crw_product_variant" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "slug" varchar(255), "pageTitle" varchar(2000), "pageDescription" varchar(4000), "_meta" text, "createDate" datetime NOT NULL DEFAULT (datetime('now')), "updateDate" datetime NOT NULL DEFAULT (datetime('now')), "isEnabled" boolean DEFAULT (1), "productId" integer NOT NULL, "name" varchar(255), "price" float, "oldPrice" float, "sku" varchar(255), "mainImage" varchar(400), "images" text, "stockAmount" integer, "stockStatus" varchar(255), "manageStock" boolean, "description" text, "descriptionDelta" text, "attributesJson" text, CONSTRAINT "UQ_c7c9273af9577aa30bb613bfe53" UNIQUE ("slug"), CONSTRAINT "FK_a787a73dfa5575dafeaab729bb5" FOREIGN KEY ("productId") REFERENCES "crw_product" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_crw_product_variant"("id", "slug", "pageTitle", "pageDescription", "_meta", "createDate", "updateDate", "isEnabled", "productId", "name", "price", "oldPrice", "sku", "mainImage", "images", "stockAmount", "stockStatus", "manageStock", "description", "descriptionDelta", "attributesJson") SELECT "id", "slug", "pageTitle", "pageDescription", "_meta", "createDate", "updateDate", "isEnabled", "productId", "name", "price", "oldPrice", "sku", "mainImage", "images", "stockAmount", "stockStatus", "manageStock", "description", "descriptionDelta", "attributesJson" FROM "crw_product_variant"`,
    );
    await queryRunner.query(`DROP TABLE "crw_product_variant"`);
    await queryRunner.query(`ALTER TABLE "temporary_crw_product_variant" RENAME TO "crw_product_variant"`);
    await queryRunner.query(`CREATE INDEX "IDX_4f0d03313fc011fd0cdf8db5a8" ON "crw_product_variant" ("createDate") `);
    await queryRunner.query(`CREATE INDEX "IDX_57a78fa5ef24fa0ea0fa33a74e" ON "crw_product_variant" ("updateDate") `);
    await queryRunner.query(`CREATE INDEX "IDX_d56c009fabddf3cf7a7b54210b" ON "crw_product_variant" ("name") `);
    await queryRunner.query(`CREATE INDEX "IDX_36939bbe847d64f4b78f3b5234" ON "crw_product_variant" ("price") `);
    await queryRunner.query(`CREATE INDEX "IDX_4676dd0b234c31f55656eb82b5" ON "crw_product_variant" ("oldPrice") `);
    await queryRunner.query(`CREATE INDEX "IDX_9ae265ee4eb7735d7f0f2eb84d" ON "crw_product_variant" ("sku") `);
    await queryRunner.query(`CREATE INDEX "IDX_421fcfb5bf7bf531646dcd52ab" ON "crw_product_variant" ("stockAmount") `);
    await queryRunner.query(`CREATE INDEX "IDX_e34d9eb5816f615f44218fe5c2" ON "crw_product_variant" ("stockStatus") `);
  }

  async down(queryRunner) {
    await queryRunner.query(`DROP INDEX "IDX_e34d9eb5816f615f44218fe5c2"`);
    await queryRunner.query(`DROP INDEX "IDX_421fcfb5bf7bf531646dcd52ab"`);
    await queryRunner.query(`DROP INDEX "IDX_9ae265ee4eb7735d7f0f2eb84d"`);
    await queryRunner.query(`DROP INDEX "IDX_4676dd0b234c31f55656eb82b5"`);
    await queryRunner.query(`DROP INDEX "IDX_36939bbe847d64f4b78f3b5234"`);
    await queryRunner.query(`DROP INDEX "IDX_d56c009fabddf3cf7a7b54210b"`);
    await queryRunner.query(`DROP INDEX "IDX_57a78fa5ef24fa0ea0fa33a74e"`);
    await queryRunner.query(`DROP INDEX "IDX_4f0d03313fc011fd0cdf8db5a8"`);
    await queryRunner.query(`ALTER TABLE "crw_product_variant" RENAME TO "temporary_crw_product_variant"`);
    await queryRunner.query(
      `CREATE TABLE "crw_product_variant" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "slug" varchar(255), "pageTitle" varchar(2000), "pageDescription" varchar(4000), "_meta" text, "createDate" datetime NOT NULL DEFAULT (datetime('now')), "updateDate" datetime NOT NULL DEFAULT (datetime('now')), "isEnabled" boolean DEFAULT (1), "productId" integer NOT NULL, "name" varchar(255), "price" float, "oldPrice" float, "sku" varchar(255), "mainImage" varchar(400), "images" text, "stockAmount" integer, "stockStatus" varchar(255), "manageStock" boolean, "description" text, "descriptionDelta" text, "attributesJson" text, CONSTRAINT "UQ_c7c9273af9577aa30bb613bfe53" UNIQUE ("slug"))`,
    );
    await queryRunner.query(
      `INSERT INTO "crw_product_variant"("id", "slug", "pageTitle", "pageDescription", "_meta", "createDate", "updateDate", "isEnabled", "productId", "name", "price", "oldPrice", "sku", "mainImage", "images", "stockAmount", "stockStatus", "manageStock", "description", "descriptionDelta", "attributesJson") SELECT "id", "slug", "pageTitle", "pageDescription", "_meta", "createDate", "updateDate", "isEnabled", "productId", "name", "price", "oldPrice", "sku", "mainImage", "images", "stockAmount", "stockStatus", "manageStock", "description", "descriptionDelta", "attributesJson" FROM "temporary_crw_product_variant"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_crw_product_variant"`);
    await queryRunner.query(`CREATE INDEX "IDX_e34d9eb5816f615f44218fe5c2" ON "crw_product_variant" ("stockStatus") `);
    await queryRunner.query(`CREATE INDEX "IDX_421fcfb5bf7bf531646dcd52ab" ON "crw_product_variant" ("stockAmount") `);
    await queryRunner.query(`CREATE INDEX "IDX_9ae265ee4eb7735d7f0f2eb84d" ON "crw_product_variant" ("sku") `);
    await queryRunner.query(`CREATE INDEX "IDX_4676dd0b234c31f55656eb82b5" ON "crw_product_variant" ("oldPrice") `);
    await queryRunner.query(`CREATE INDEX "IDX_36939bbe847d64f4b78f3b5234" ON "crw_product_variant" ("price") `);
    await queryRunner.query(`CREATE INDEX "IDX_d56c009fabddf3cf7a7b54210b" ON "crw_product_variant" ("name") `);
    await queryRunner.query(`CREATE INDEX "IDX_57a78fa5ef24fa0ea0fa33a74e" ON "crw_product_variant" ("updateDate") `);
    await queryRunner.query(`CREATE INDEX "IDX_4f0d03313fc011fd0cdf8db5a8" ON "crw_product_variant" ("createDate") `);
    await queryRunner.query(`DROP INDEX "IDX_5d353c6757ba25557fcaa97b16"`);
    await queryRunner.query(`DROP INDEX "IDX_043b6fccace5ccd18abcd0472d"`);
    await queryRunner.query(`ALTER TABLE "crw_product_variant_meta" RENAME TO "temporary_crw_product_variant_meta"`);
    await queryRunner.query(
      `CREATE TABLE "crw_product_variant_meta" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "key" varchar(255), "value" text, "shortValue" varchar(255), "entityId" integer NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "crw_product_variant_meta"("id", "key", "value", "shortValue", "entityId") SELECT "id", "key", "value", "shortValue", "entityId" FROM "temporary_crw_product_variant_meta"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_crw_product_variant_meta"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_5d353c6757ba25557fcaa97b16" ON "crw_product_variant_meta" ("shortValue") `,
    );
    await queryRunner.query(`CREATE INDEX "IDX_043b6fccace5ccd18abcd0472d" ON "crw_product_variant_meta" ("key") `);
    await queryRunner.query(`DROP INDEX "IDX_a51cbca1c3ed52d289104a4029"`);
    await queryRunner.query(`DROP INDEX "IDX_519eaf50959bea415509872bb9"`);
    await queryRunner.query(`DROP INDEX "IDX_e734039ba75ee043d3c61466de"`);
    await queryRunner.query(`DROP INDEX "IDX_c07a670f3308a2db7824d76d6a"`);
    await queryRunner.query(`DROP INDEX "IDX_a4383ddcc0498cfacd641f9cf8"`);
    await queryRunner.query(`DROP INDEX "IDX_fbee175d8049460160e35a36ba"`);
    await queryRunner.query(`DROP INDEX "IDX_c717d9265ea3490790ee35edcd"`);
    await queryRunner.query(`DROP INDEX "IDX_5adfdd26419d9b737b683a8c65"`);
    await queryRunner.query(`DROP INDEX "IDX_77dc2abc46299b49ead89048d4"`);
    await queryRunner.query(`ALTER TABLE "crw_product" RENAME TO "temporary_crw_product"`);
    await queryRunner.query(
      `CREATE TABLE "crw_product" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "slug" varchar(255), "pageTitle" varchar(2000), "pageDescription" varchar(4000), "_meta" text, "createDate" datetime NOT NULL DEFAULT (datetime('now')), "updateDate" datetime NOT NULL DEFAULT (datetime('now')), "isEnabled" boolean DEFAULT (1), "name" varchar(255), "mainCategoryId" integer, "price" float, "oldPrice" float, "sku" varchar(255), "mainImage" varchar(400), "images" text, "stockAmount" integer, "stockStatus" varchar(255), "description" text, "descriptionDelta" text, "averageRating" decimal, "reviewsCount" integer, CONSTRAINT "UQ_404785f00e4d88df4fa5783830b" UNIQUE ("slug"))`,
    );
    await queryRunner.query(
      `INSERT INTO "crw_product"("id", "slug", "pageTitle", "pageDescription", "_meta", "createDate", "updateDate", "isEnabled", "name", "mainCategoryId", "price", "oldPrice", "sku", "mainImage", "images", "stockAmount", "stockStatus", "description", "descriptionDelta", "averageRating", "reviewsCount") SELECT "id", "slug", "pageTitle", "pageDescription", "_meta", "createDate", "updateDate", "isEnabled", "name", "mainCategoryId", "price", "oldPrice", "sku", "mainImage", "images", "stockAmount", "stockStatus", "description", "descriptionDelta", "averageRating", "reviewsCount" FROM "temporary_crw_product"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_crw_product"`);
    await queryRunner.query(`CREATE INDEX "IDX_a51cbca1c3ed52d289104a4029" ON "crw_product" ("createDate") `);
    await queryRunner.query(`CREATE INDEX "IDX_519eaf50959bea415509872bb9" ON "crw_product" ("updateDate") `);
    await queryRunner.query(`CREATE INDEX "IDX_e734039ba75ee043d3c61466de" ON "crw_product" ("name") `);
    await queryRunner.query(`CREATE INDEX "IDX_c07a670f3308a2db7824d76d6a" ON "crw_product" ("mainCategoryId") `);
    await queryRunner.query(`CREATE INDEX "IDX_a4383ddcc0498cfacd641f9cf8" ON "crw_product" ("price") `);
    await queryRunner.query(`CREATE INDEX "IDX_fbee175d8049460160e35a36ba" ON "crw_product" ("oldPrice") `);
    await queryRunner.query(`CREATE INDEX "IDX_c717d9265ea3490790ee35edcd" ON "crw_product" ("sku") `);
    await queryRunner.query(`CREATE INDEX "IDX_5adfdd26419d9b737b683a8c65" ON "crw_product" ("stockAmount") `);
    await queryRunner.query(`CREATE INDEX "IDX_77dc2abc46299b49ead89048d4" ON "crw_product" ("stockStatus") `);
    await queryRunner.query(`DROP INDEX "IDX_e34d9eb5816f615f44218fe5c2"`);
    await queryRunner.query(`DROP INDEX "IDX_421fcfb5bf7bf531646dcd52ab"`);
    await queryRunner.query(`DROP INDEX "IDX_9ae265ee4eb7735d7f0f2eb84d"`);
    await queryRunner.query(`DROP INDEX "IDX_4676dd0b234c31f55656eb82b5"`);
    await queryRunner.query(`DROP INDEX "IDX_36939bbe847d64f4b78f3b5234"`);
    await queryRunner.query(`DROP INDEX "IDX_d56c009fabddf3cf7a7b54210b"`);
    await queryRunner.query(`DROP INDEX "IDX_57a78fa5ef24fa0ea0fa33a74e"`);
    await queryRunner.query(`DROP INDEX "IDX_4f0d03313fc011fd0cdf8db5a8"`);
    await queryRunner.query(`DROP TABLE "crw_product_variant"`);
    await queryRunner.query(`DROP INDEX "IDX_5d353c6757ba25557fcaa97b16"`);
    await queryRunner.query(`DROP INDEX "IDX_043b6fccace5ccd18abcd0472d"`);
    await queryRunner.query(`DROP TABLE "crw_product_variant_meta"`);
  }
};
