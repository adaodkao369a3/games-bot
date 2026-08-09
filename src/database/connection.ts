import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { config } from '../config/index.js';
import { DatabaseSchema } from './schema.js';
import path from 'path';
import fs from 'fs';

let db: Low<DatabaseSchema> | null = null;

// Custom write function to handle Windows file system issues
function safeWriteJsonFile(filePath: string, data: any): void {
  try {
    const json = JSON.stringify(data, null, 2);
    fs.writeFileSync(filePath, json, 'utf8');
  } catch (error) {
    console.error('Direct file write error:', error);
    throw error;
  }
}

export function getDatabase(): Low<DatabaseSchema> {
  if (!db) {
    const dbPath = config.database.url;
    const dbDir = path.dirname(dbPath);
    
    // Ensure data directory exists
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    
    // Convert to .json file if it doesn't end with .json
    const jsonPath = dbPath.endsWith('.json') ? dbPath : dbPath.replace(/\.[^/.]+$/, '.json');
    
    // Ensure the JSON file exists
    if (!fs.existsSync(jsonPath)) {
      safeWriteJsonFile(jsonPath, {
        smashEvents: [],
        votes: [],
        recentUserActivity: [],
        channelActivity: [],
      });
    }
    
    // Create custom adapter that uses direct file writing
    const adapter = {
      read: async () => {
        try {
          const data = fs.readFileSync(jsonPath, 'utf8');
          return JSON.parse(data);
        } catch (error) {
          console.error('Database read error:', error);
          return null;
        }
      },
      write: async (data: DatabaseSchema) => {
        safeWriteJsonFile(jsonPath, data);
      }
    };
    
    db = new Low(adapter, {
      smashEvents: [],
      votes: [],
      recentUserActivity: [],
      channelActivity: [],
    });
    
    // Initialize database with default data if needed
    db.data ||= {
      smashEvents: [],
      votes: [],
      recentUserActivity: [],
      channelActivity: [],
    };
    
    // Try to write, but handle Windows file system issues
    try {
      db.write();
    } catch (error) {
      console.error('Database write error during initialization:', error);
      // Continue anyway - the file should exist from our safeWriteJsonFile above
    }
  }
  
  return db!;
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    try {
      await db.write();
    } catch (error) {
      console.error('Database write error during close:', error);
    }
    db = null;
  }
}

export async function transaction<T>(fn: () => T): Promise<T> {
  const database = getDatabase();
  const result = fn();
  try {
    await database.write();
  } catch (error) {
    console.error('Database write error during transaction:', error);
  }
  return result;
}
