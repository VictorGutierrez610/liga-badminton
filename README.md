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
