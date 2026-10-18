import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { APPS_SCRIPT_CODE } from '../src/lib/appsScriptBackendCode.js';

const deploymentFile = fileURLToPath(new URL('../Molaye/gs_liga_viernes.gs', import.meta.url));
const deploymentCode = readFileSync(deploymentFile, 'utf8');
const canonicalSheetId = APPS_SCRIPT_CODE.match(/const SHEET_ID = '([^']+)'/)?.[1];
const deploymentSheetId = deploymentCode.match(/const SHEET_ID = '([^']+)'/)?.[1];

if (!canonicalSheetId || !deploymentSheetId) {
  throw new Error('No se pudo determinar el ID de hoja de uno de los backends Apps Script.');
}

const synchronizedCode = APPS_SCRIPT_CODE.replaceAll(canonicalSheetId, deploymentSheetId);
writeFileSync(deploymentFile, synchronizedCode, 'utf8');
console.log(`Backend Apps Script actualizado, conservando el destino de hoja ${deploymentSheetId}.`);
