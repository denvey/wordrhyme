import { CContainer, CPlugin, Link, useCmsSettings } from '@cromwell/core-frontend';
import { AppBar, IconButton, Slide, SwipeableDrawer, Toolbar, useScrollTrigger } from '@mui/material';
import React, { useState } from 'react';

import commonStyles from '../../styles/common.module.scss';
import { CloseIcon, MenuIcon } from '../icons';
import styles from './Header.module.scss';
import { HeaderSearch } from './HeaderSearch';

const Header = () => {
  const cmsConfig = useCmsSettings();
  const [menuOpen, setMenuOpen] = useState(false);
  const handleCloseMenu = () => {
    setMenuOpen(false);
  };
  const handleOpenMenu = () => {
    setMenuOpen(true);
  };

  return (
    <CContainer global id="header-01">
      <Toolbar className={styles.dummyToolbar} />
      <HideOnScroll>
        <AppBar className={styles.appBar} color="transparent">
          <Toolbar>
            <CContainer className={`${styles.Header} ${commonStyles.text}`} id="header-02">
              <CContainer className={`${commonStyles.content} ${styles.headerContent}`} id="header-03">
                <CContainer className={styles.logoWrapper} id="header-06">
                  <Link href="/">
                    <img className={styles.logo} src={cmsConfig?.logo} alt="logo" />
                  </Link>
                </CContainer>
                <CPlugin
                  className={styles.mainMenu}
                  id="header_main_menu"
                  pluginName={'@cromwell/plugin-main-menu'}
                  blockName="Main menu"
                />
                <CContainer className={styles.search} id="header-04">
                  <HeaderSearch />
                </CContainer>
                <CContainer className={styles.mobileActions} id="header-05">
                  <IconButton aria-label={'Open main menu'} onClick={handleOpenMenu}>
                    <MenuIcon color="#111" />
                  </IconButton>
                </CContainer>
              </CContainer>
            </CContainer>
          </Toolbar>
        </AppBar>
      </HideOnScroll>
      <SwipeableDrawer open={menuOpen} onClose={handleCloseMenu} onOpen={handleOpenMenu}>
        <div className={styles.drawer}>
          <div className={styles.menuActions}>
            <div></div>
            <IconButton aria-label="Close main menu" onClick={handleCloseMenu}>
              <CloseIcon color="#111" />
            </IconButton>
          </div>
          <div className={styles.mobileSearch}>
            <HeaderSearch />
          </div>
          <div>
            <CPlugin
              id="header_main_menu"
              plugin={{
                instanceSettings: {
                  mobile: true,
                },
                pluginName: '@cromwell/plugin-main-menu',
              }}
              blockName="Main menu"
            />
          </div>
        </div>
      </SwipeableDrawer>
    </CContainer>
  );
};

export default Header;

function HideOnScroll(props: { children: React.ReactElement }) {
  const trigger = useScrollTrigger();

  return (
    <Slide appear={false} direction="down" in={!trigger}>
      {props.children}
    </Slide>
  );
}
