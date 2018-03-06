# Deploying your project

We use docker to package and distribute our applications to production.
As such, this guide is opinionated and is by no means the only way to deploy your app.

A quick thank you to [Manus Tech](https://manas.tech/blog/2017/04/03/shipping-crystal-apps-in-a-small-docker-image.html) for publishing their work in this area.

## Prerequisites

Some useful online tools:

* a [docker hub](https://hub.docker.com/billing-plans/) account (free)
* optionally a [codefresh](https://codefresh.io/) account for fast auto-builds
* install [docker](https://docs.docker.com/docker-for-mac/install/) for your operating system

## Creating a Docker image

This will create a docker image that is roughly 45 MiB in size, when using the default Dockerfile.

1. in a terminal, `cd` into the application folder
1. run: `docker build -t dhub-user/spider-gazelle:latest .` (latest is the default tag)
   * this will create a docker image and tag it
   * you can also run `docker build .` and then `docker images` if you don't have docker hub


Then you can run the image locally if you like

* `docker run -it --rm dhub-user/spider-gazelle`


To save this image for use in a deployment requires docker hub

1. `docker login`
1. `docker push dhub-user/spider-gazelle`


## Deployment

1. ssh into your server
1. log into docker hub if using a private repo: `docker login`
1. `docker pull dhub-user/spider-gazelle`
1. `docker run -d -p 8080:8080 --restart=always --name=spider-gazelle dhub-user/spider-gazelle`
   * `-d` means daemonize
   * `-p 8080:8080` maps the container port 8080 to the OS port 8080
   * `--restart=always` means the service should always be running (after computer restarts or app crashes)
   * `--name=spider-gazelle` the name of the docker service
1. you can now start and stop the service as you desire
   * `docker start spider-gazelle` (if you named the service spider-gazelle)
   * `docker stop spider-gazelle`
   * `docker restart spider-gazelle`
   * `docker rm spider-gazelle` (removes the service)


## Automated builds

If you would like your docker image to be ready to deploy every time you commit a change


### Codefresh

We prefer [codefresh](https://codefresh.io/) for this job as the builds run faster when compared to docker hub.

1. Login using your browser
1. Click "add repository"
1. Select your git repository (or add by URL)
1. Select the branch to use for builds


### Docker Hub

1. Login on your browser
1. Click "create automated build"
1. select your git repository
1. select your Dockerfile

