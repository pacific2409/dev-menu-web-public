import { NavLink } from 'react-router-dom';

import styles from './ApplicationHeader.module.css';

function getNavigationClassName({ isActive }: { isActive: boolean }) {
  const navigationLink = styles.navigationLink ?? '';
  return isActive ? `${navigationLink} ${styles.activeNavigationLink ?? ''}` : navigationLink;
}

export function ApplicationHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <NavLink className={styles.brand ?? ''} to="/">
          <span className={styles.brandMark} aria-hidden="true">
            DM
          </span>
          <span>Dev Menu</span>
        </NavLink>
        <nav aria-label="メインナビゲーション">
          <ul className={styles.navigationList}>
            <li>
              <NavLink className={getNavigationClassName} to="/" end>
                課題を注文
              </NavLink>
            </li>
            <li>
              <NavLink className={getNavigationClassName} to="/shared-histories">
                共有履歴
              </NavLink>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
