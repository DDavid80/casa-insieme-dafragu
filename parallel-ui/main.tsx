import React from 'react';
import { createRoot } from 'react-dom/client';
import '../app/globals.css';
import Page from '../app/page';
import { installSheetsApi } from './sheets-api';
class ErrorBoundary extends React.Component<{children:React.ReactNode},{error:string}>{
 state={error:''};static getDerivedStateFromError(error:Error){return{error:error.message};}
 render(){return this.state.error?<main className="security-screen"><section className="security-card"><h1>Caricamento interrotto</h1><p>{this.state.error}</p><button className="primary-btn" onClick={()=>location.reload()}>Ricarica</button></section></main>:this.props.children;}
}
installSheetsApi();
createRoot(document.getElementById('root')!).render(<ErrorBoundary><Page /></ErrorBoundary>);
