export const ENDPOINT='https://script.google.com/macros/s/AKfycbzDdamH7lUicUX2RzqqlHtKtSUxf9TNSdHjNNtnCGvFjPBkQVS07L3qf_qqrnHjhhGQ7A/exec';
export const TOKEN_KEY='dafragu-sheets-session';
export const nativeFetch=window.fetch.bind(window);
export async function remote(request:Record<string,any>){
 const r=await nativeFetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({...request,token:localStorage.getItem(TOKEN_KEY)||''})});
 const d=await r.json();if(!d.ok)throw new Error(d.error||'Archivio Google non disponibile');return d;
}
