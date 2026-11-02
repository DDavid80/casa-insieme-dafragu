import React from 'react';
import { createRoot } from 'react-dom/client';
import '../app/globals.css';
import Page from '../app/page';
import { installSheetsApi } from './sheets-api';
installSheetsApi();
createRoot(document.getElementById('root')!).render(<React.StrictMode><Page /></React.StrictMode>);
