# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:


## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
# Los Finos ERP

Aplicación web de gestión para Los Finos, construida con React, Vite y React Router.

## Requisitos

- Node.js 22 o superior
- npm 10 o superior

## Puesta en marcha

```bash
npm install
npm run dev
```

Vite mostrará la dirección local, normalmente `http://localhost:5173`.

## Comandos

```bash
npm run dev      # servidor de desarrollo con recarga en caliente
npm run lint     # revisa errores de ESLint
npm run build    # genera la compilación de producción
npm run preview  # sirve localmente la compilación generada
```

## Acceso de demostración

La aplicación usa datos locales de demostración y guarda las órdenes en `localStorage`. No es un sistema de autenticación de producción.

Usuarios disponibles:

| Usuario | Rol |
| --- | --- |
| `gerente@losfinos.pe` | Gerente |
| `caja@losfinos.pe` | Caja |
| `mozo@losfinos.pe` | Mozo |
| `almacen@losfinos.pe` | Almacén |
| `cocina@losfinos.pe` | Cocina |

Contraseña para todos los usuarios demo: `123456`.

## Trabajo en equipo

La rama `feat/ventas` es la rama compartida de integración para el módulo Comercial/Ventas. Cada integrante debe crear una rama temporal por tarea o funcionalidad, no una rama permanente por persona.

1. Actualiza la rama de integración: `git switch feat/ventas` y `git pull origin feat/ventas`.
2. Crea una rama para tu tarea: `git switch -c feat/ventas-nombre-de-la-tarea`.
3. Ejecuta `npm run lint` y `npm run build` antes de subir cambios.
4. Publica tu rama: `git push -u origin feat/ventas-nombre-de-la-tarea`.
5. Abre un Pull Request hacia `feat/ventas` y espera la revisión del equipo.
6. Cuando el módulo esté estable, integra `feat/ventas` hacia `main`.

El workflow de GitHub Actions ejecuta automáticamente lint y build en los Pull Requests y en los cambios integrados en `main`.

## Estructura principal

- `src/app`: contextos globales, como autenticación.
- `src/modules`: lógica y estado por módulo.
- `src/pages`: pantallas y rutas de la aplicación.
- `src/data`: datos de demostración.
- `public`: recursos estáticos públicos.
