# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

While this project uses React, Vite supports many popular JS frameworks. [See all the supported frameworks](https://vitejs.dev/guide/#scaffolding-your-first-vite-project).

## Deploy Your Own

Deploy your own Vite project with Vercel.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/examples/tree/main/framework-boilerplates/vite-react&template=vite-react)

_Live Example: https://vite-react-example.vercel.app_

### Login API

The frontend login form sends either `{"email":"...","password":"..."}`
or `{"username":"...","password":"..."}` to `POST /login`, based on whether
the identifier looks like an email address. The API response must contain a
non-empty `remember_token`, `token`, or `access_token` value. The token is
saved in `localStorage` only when Remember me is checked. When it is not
checked, the token is stored in `sessionStorage`, so a refresh keeps the user
logged in while closing the browser session removes it. The gallery displays a
welcome message for an active login instead of the Log in button.

### Deploying From Your Terminal

You can deploy your new Vite project with a single command from your terminal using [Vercel CLI](https://vercel.com/download):

```shell
$ vercel
```
