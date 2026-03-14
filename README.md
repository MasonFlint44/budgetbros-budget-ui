# BudgetbrosBudgetUi

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.1.4.

## AWS Cognito Login Setup

The app now uses the `angular-oauth2-oidc` package with Cognito Hosted UI
(OAuth 2.0 Authorization Code + PKCE).

1. Open `src/app/auth/cognito.config.ts`.
2. Set `domain` to your Cognito Hosted UI domain.
3. Set `clientId` to your Cognito App Client ID (without a client secret).
4. Set `redirectUri` and `logoutUri` to URLs allowed in your Cognito app client settings.
5. Keep `openid` in `scopes` so user profile data can be loaded.

After these values are set, run `ng serve` and use the `Sign in with Cognito` button in the UI.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
