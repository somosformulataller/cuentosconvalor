// Lee el .env si existe (Node 22 lo trae: process.loadEnvFile).
import { existsSync } from 'node:fs'
if (existsSync('.env')) process.loadEnvFile('.env')
