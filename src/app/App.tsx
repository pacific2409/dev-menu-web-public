import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { PracticeProposalPage } from '../features/practice-proposal/pages/PracticeProposalPage.tsx';
import { SharedHistoryDetailPage } from '../features/shared-history/pages/SharedHistoryDetailPage.tsx';
import { SharedHistoryPage } from '../features/shared-history/pages/SharedHistoryPage.tsx';
import { ApplicationHeader } from '../shared/components/ApplicationHeader.tsx';
import styles from './App.module.css';

export function App() {
  return (
    <BrowserRouter>
      <div className={styles.application}>
        <ApplicationHeader />
        <main className={styles.main}>
          <Routes>
            <Route path="/" element={<PracticeProposalPage />} />
            <Route path="/shared-histories" element={<SharedHistoryPage />} />
            <Route path="/shared-histories/:historyId" element={<SharedHistoryDetailPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
