import { EntityCustomFields } from '@components/entity/entityEdit/components/EntityCustomFields';
import { EntityMetaFields } from '@components/entity/entityEdit/components/EntityMetaFields';
import { TFieldsComponentProps } from '@components/entity/types';
import { SearchInput } from '@components/inputs/Search/SearchInput';
import { TAttribute, TPagedParams, TProduct, TProductCategory } from '@cromwell/core';
import { getGraphQLClient } from '@cromwell/core-frontend';
import { useForceUpdate } from '@helpers/forceUpdate';
import { Box, Grid } from '@mui/material';
import queryString from 'query-string';
import React, { useContext, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { productPageInfo } from '../../../constants/PageInfos';
import { ProductContext } from '../contexts/Product';
import { useTabs } from '../hooks/useTabs';
import styles from '../Product.module.scss';
import { AttributesTab } from './AttributesTab';
import MainInfoCard from './MainInfoCard';
import { VariantsTab } from './VariantsTab';

export const PageContent = ({ entityData, canValidate }: TFieldsComponentProps<TProduct>) => {
  const client = getGraphQLClient();
  const location = useLocation();
  const productRef = React.useRef<TProduct | null | undefined>(entityData);
  const context = useContext(ProductContext);
  const [mainCategory, setMainCategory] = useState<TProductCategory | null>(null);
  const [activeTabNum, changeTab] = useTabs();
  const [attributes, setAttributes] = useState<TAttribute[]>([]);
  const [usedVariantAttributes, setUsedVariantAttributes] = useState<string[]>(
    entityData?.variants?.reduce((prev: string[], curr) => {
      Object.entries(curr.attributes ?? {}).forEach(([key]) => {
        if (key && !prev.includes(key)) prev.push(key);
      });
      return prev;
    }, []) || [],
  );
  const forceUpdate = useForceUpdate();

  if (!context.store.productRef.data && productRef.current) {
    context.store.productRef.data = productRef.current;
  }

  const setProdData = (data: Partial<TProduct>) => {
    productRef.current = Object.assign({}, productRef.current, data);
    context.store.productRef.data = productRef.current;
  };

  const handleSearchCategory = async (text: string, params: TPagedParams<TProductCategory>) => {
    return client.getProductCategories({
      filterParams: {
        nameSearch: text,
      },
      pagedParams: params,
    });
  };

  const handleChangeCategories = (data: TProductCategory[]) => {
    if (!data?.length) setProdData({ categories: null });
    else setProdData({ categories: data });
  };

  const handleMainCategoryChange = (data: TProductCategory | null) => {
    if (productRef.current?.mainCategoryId === data?.id) return;
    setProdData({ mainCategoryId: data?.id || null });
  };

  useEffect(() => {
    getMainCategory();
    getAttributes();
  }, []);

  useEffect(() => {
    const parsed = queryString.parse(location.search);
    if (location.pathname.startsWith(productPageInfo.baseRoute + '/')) changeTab(Number(parsed.tab ?? '0'));
  }, [location]);

  const getMainCategory = async () => {
    if (productRef.current?.mainCategoryId) {
      try {
        const main = await client.getProductCategoryById(productRef.current?.mainCategoryId);
        if (main) {
          setMainCategory(main);
        }
      } catch (e) {
        console.error(e);
      }
    }
  };

  const getAttributes = async () => {
    try {
      const attr = await client?.getAttributes({ pagedParams: { pageSize: 1000 } });
      if (attr?.elements) setAttributes(attr.elements);
    } catch (e) {
      console.error(e);
    }
  };

  if (!productRef.current)
    return (
      <Box className={styles.PageContent}>
        <h1>Product not found</h1>
      </Box>
    );

  return (
    <Box className={styles.PageContent}>
      {activeTabNum === 0 && (
        <Box sx={{ padding: '20px', borderRadius: '10px' }} className={styles.paper}>
          <MainInfoCard product={productRef.current} setProdData={setProdData} canValidate={canValidate} />
          <Grid container spacing={3} sx={{ mt: '15px' }}>
            <Grid item xs={12} sm={12}>
              <SearchInput<TProductCategory>
                multiple
                loader={handleSearchCategory}
                onSelect={handleChangeCategories}
                getOptionLabel={(data) =>
                  `${data.name} (id: ${data.id}${data?.parent?.id ? `; parent id: ${data.parent.id}` : ''})`
                }
                getOptionValue={(data) => data.name || ''}
                fullWidth
                defaultValue={productRef.current.categories ?? []}
                label={'Categories'}
              />
            </Grid>
            <Grid item xs={12} sm={12}>
              <SearchInput<TProductCategory>
                loader={handleSearchCategory}
                onSelect={handleMainCategoryChange}
                getOptionLabel={(data) =>
                  `${data.name} (id: ${data.id}${data?.parent?.id ? `; parent id: ${data.parent.id}` : ''})`
                }
                getOptionValue={(data) => data.name || ''}
                fullWidth
                defaultValue={mainCategory}
                label={'Main category'}
              />
            </Grid>
            <EntityMetaFields />
            <EntityCustomFields />
          </Grid>
        </Box>
      )}
      {activeTabNum === 1 && (
        <>
          <AttributesTab
            forceUpdate={forceUpdate}
            product={productRef.current}
            setProdData={setProdData}
            attributes={attributes}
          />
        </>
      )}
      {activeTabNum === 2 && (
        <>
          <VariantsTab
            forceUpdate={forceUpdate}
            product={productRef.current}
            setProdData={setProdData}
            attributes={attributes}
            usedVariantAttributes={usedVariantAttributes}
            setUsedVariantAttributes={setUsedVariantAttributes}
          />
        </>
      )}
    </Box>
  );
};
