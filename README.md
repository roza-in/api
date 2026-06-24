<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Docker Configurations & Orchestration

This application includes a production-grade multi-stage Docker configuration and local docker-compose orchestration.

### 1. File Structure
- **[Dockerfile](file:///c:/Users/shiva/OneDrive/Documents/Desktop/Startups/rozx/api/Dockerfile)**: A 4-stage build utilizing `node:22-alpine` (builder and runner stages keep production dependencies thin and image size small).
- **[docker-compose.yml](file:///c:/Users/shiva/OneDrive/Documents/Desktop/Startups/rozx/api/docker-compose.yml)**: Spins up the NestJS API container alongside the database (`PostgreSQL 16`) and caching/queue store (`Redis 7`).
- **[.env.docker](file:///c:/Users/shiva/OneDrive/Documents/Desktop/Startups/rozx/api/.env.docker)**: Configuration mapping connections to internal container network hostnames.
- **[.env.production](file:///c:/Users/shiva/OneDrive/Documents/Desktop/Startups/rozx/api/.env.production)** & **[.env.staging](file:///c:/Users/shiva/OneDrive/Documents/Desktop/Startups/rozx/api/.env.staging)**: Production and staging configuration templates.

### 2. Local Container Execution
To spin up the entire stack (PostgreSQL + Redis + Migrations + API) in containers:

1. Build and start containers:
   ```bash
   $ docker compose up --build
   ```
2. The database migrations will execute automatically via the `migration` container before the NestJS API bootstraps.
3. Access the API on `http://localhost:3000`.

### 3. Production & Staging Deployments
- Do not build environment files directly into the Docker image.
- Supply staging/production credentials at container start via target orchestrator parameters or task definitions (e.g., AWS ECS Task Definition or Kubernetes Secrets).
- Run migrations in your CI/CD pipeline or as a pre-requisite container execution step (`npx prisma migrate deploy`) before launching the updated API instances.

### 4. CI/CD & EC2 Deployments (GitHub Actions)
This project includes an automated deployment workflow configured in [ci-cd.yml](file:///c:/Users/shiva/OneDrive/Documents/Desktop/Startups/rozx/api/.github/workflows/ci-cd.yml). To enable automated builds and deploys to AWS EC2:

1. Configure the following **GitHub Repository Secrets**:
   - `EC2_SSH_KEY`: Private SSH key (`.pem` file content) used to connect to your EC2 instances.
   - `EC2_USER`: The SSH login username (typically `ubuntu` or `ec2-user`).
   - `EC2_HOST_STAGING` / `EC2_HOST_PRODUCTION`: The public IP addresses/hostnames of your staging and production servers.
   - `DOCKER_USERNAME` / `DOCKER_PASSWORD`: Docker Hub credentials used to push and pull built images.
   - `ENV_STAGING` / `ENV_PRODUCTION`: The raw key-value configuration strings containing secrets (similar to `.env.staging` / `.env.production`) to create the `.env.docker` files on target servers dynamically.

2. On push to the `staging` branch, the pipeline runs lint, tests, builds, and deploys the stack to Staging EC2.
3. On push to the `main` branch, the pipeline runs lint, tests, builds, and deploys the stack to Production EC2.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).


# Step 1: Check if the containers are actually running
docker compose ps

# Step 2: If the API or Migration container has exited or is dead, check the logs
docker compose logs api
docker compose logs migration

# Step 3: Check if something else is blocking the port (Connection Refused)
sudo netstat -tulnp | grep 3001

# Step 4: Check Nginx error logs on the host to see exactly where Nginx tried to connect
sudo tail -n 50 /var/log/nginx/error.log
