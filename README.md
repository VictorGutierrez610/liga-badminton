# Liga de Bádminton de los Viernes UNI

Aplicación web para organizar la liga de bádminton del club: permite consultar partidos y rankings, y administrar jornadas, participantes, competiciones y resultados.

## Funcionalidades

- Partidos: consulta de encuentros, fases de grupos y cuadros eliminatorios.
- Rankings individuales de categorías masculinas, femeninas y dobles, con puntos por jornada y mejores resultados de temporada.
- Gestor de competición para crear jornadas, inscribir participantes, generar partidos y registrar resultados.
- Sincronización de los datos con Google Sheets mediante Google Apps Script.

## Desarrollo

Requiere Node.js `>=22.12.0`.

```sh
npm install
npm run dev
```

## Compilar y previsualizar

```sh
npm run build
npm run preview
```

La aplicación usa Astro y guarda datos localmente en el navegador. Para sincronizarlos con Google Sheets, configura la URL de despliegue y el PIN de Apps Script en la sección **Conexión Google Sheets**.

## Pruebas y Apps Script

```sh
npm test
npm run sync:apps-script
```

`src/lib/appsScriptBackendCode.js` es la fuente mantenida del backend Apps Script que se copia desde la interfaz. `Molaye/gs_liga_viernes.gs` es la copia de despliegue para otra hoja: el comando `sync:apps-script` actualiza su lógica desde la fuente y conserva el `SHEET_ID` propio de esa copia. Después de cambiar el backend, despliega nuevamente el Apps Script correspondiente.

El backend devuelve una revisión de los datos y exige esa revisión en las operaciones de escritura. Por ello, sincronizar requiere una conexión al backend actualizado y haber cargado primero los datos remotos. Si la revisión cambió, la aplicación rechaza la escritura para evitar sobrescribir cambios concurrentes; hay que recargar y revisar antes de volver a intentarlo. La sincronización completa valida el contenido y trata de restaurar las filas previas si falla una escritura.

Los desempates de grupos vigentes son, en este orden: victorias, diferencia de sets, diferencia de puntos y nombre. Las clasificaciones se muestran como provisionales mientras haya partidos de grupo pendientes.
