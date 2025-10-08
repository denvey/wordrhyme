import { useRouter } from 'next/router';
import React, { useEffect } from 'react';

import { appState } from '../../helpers/AppState';
import { Footer } from '../footer/Footer';
import { Header } from '../header/Header';
import { CartModal } from '../modals/cart/CartModal';
import ProductQuickView from '../modals/productQuickView/ProductQuickView';
import { ViewedModal } from '../modals/viewed/ViewedModal';
import { WishlistModal } from '../modals/wishlist/WishlistModal';
import { SignInModal } from '../modals/signIn/SignIn';
import styles from './Layout.module.scss';

type TProps = {
  children: React.ReactNode;
};

export default function Layout(props: TProps | undefined) {
  const router = useRouter?.();

  useEffect(() => {
    appState.closeAllModals();
  }, [router?.asPath]);

  return (
    <div className={styles.Layout}>
      <Header />
      <CartModal />
      <WishlistModal />
      <ViewedModal />
      <ProductQuickView />
      <SignInModal />
      <div className={styles.main}>{props?.children}</div>
      <Footer />
    </div>
  );
}
