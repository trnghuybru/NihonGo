import React from 'react';
import { createRoot } from 'react-dom/client';
import { WebEntry } from './WebEntry';
import { WebRouter } from './WebRouter';
import './styles.css';
import './home.css';
createRoot(document.getElementById('root')!).render(
  <WebRouter>
    <WebEntry />
  </WebRouter>,
);
