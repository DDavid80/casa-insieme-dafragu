import initSqlJs from './vendor/sql';
import { drizzle } from 'drizzle-orm/d1';
import { getTableConfig, SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';
import { SQL } from 'drizzle-orm';
import * as schema from '../db/schema';
let db: any, sqlite: any;
const tables = Object.entries(schema).filter(([, t]) => {try {getTableConfig(t as any); return true;} catch {return false;}});
const quote = (s: string) => '"' + s.replaceAll('"','""') + '"';
class Statement {
  constructor(public sql: string, public params: any[] = []) {}
  bind(...params: any[]) {return new Statement(this.sql, params);}
  execute() {const stmt=sqlite.prepare(this.sql);try {stmt.bind(this.params.map(x=>typeof x==='boolean'?Number(x):x??null));const rows:any[]=[];const raw:any[]=[];while(stmt.step()){rows.push(stmt.getAsObject());raw.push(stmt.get());}return {results:rows,raw,success:true,meta:{changes:sqlite.getRowsModified()}};} finally {stmt.free();}}
  async all(){return this.execute();}
  async raw(){return this.execute().raw;}
  async run(){return this.execute();}
  async first(){return this.execute().results[0]??null;}
}
export async function loadDatabase(data: Record<string,any[]>) {
  const SQLModule=await initSqlJs(); if(sqlite)sqlite.close(); sqlite=new SQLModule.Database();
  const dialect=new SQLiteSyncDialect();
  for(const [key,table] of tables){
    const c=getTableConfig(table as any);
    const fields=c.columns.map(col=>{
      let s=quote(col.name)+' '+col.getSQLType();
      if(col.primary)s+=' PRIMARY KEY'+((col as any).autoIncrement?' AUTOINCREMENT':'');
      if(col.notNull)s+=' NOT NULL';if(col.isUnique)s+=' UNIQUE';
      if(col.default!==undefined){const v=col.default;s+=' DEFAULT '+(v instanceof SQL?dialect.sqlToQuery(v).sql:typeof v==='string'?"'"+v.replaceAll("'","''")+"'":typeof v==='boolean'?Number(v):v);}
      return s;
    });
    sqlite.run('CREATE TABLE '+quote(c.name)+' ('+fields.join(',')+')');
    for(const row of data[key]??[]){const cols=c.columns.filter(col=>{const k=Object.keys((table as any)).find(k=>(table as any)[k]===col);return k&&row[k]!==undefined;});const keys=cols.map(col=>Object.keys(table as any).find(k=>(table as any)[k]===col)!);if(!cols.length)continue;sqlite.run('INSERT INTO '+quote(c.name)+' ('+cols.map(col=>quote(col.name)).join(',')+') VALUES ('+cols.map(()=>'?').join(',')+')',keys.map(k=>typeof row[k]==='boolean'?Number(row[k]):row[k]));}
  }
  const client={prepare:(s:string)=>new Statement(s),batch:async(stmts:Statement[])=>{sqlite.run('BEGIN');try{const out=stmts.map(s=>s.execute());sqlite.run('COMMIT');return out;}catch(e){sqlite.run('ROLLBACK');throw e;}},exec:async(s:string)=>sqlite.run(s)};
  db=drizzle(client as any,{schema});return db;
}
export async function getDb(){if(!db)throw new Error('Dati non caricati');return db;}
export async function exportDatabase(){const out:Record<string,any[]>={};for(const [key,table] of tables){if(key==='appSecurity')continue;out[key]=await db.select().from(table);}return out;}
