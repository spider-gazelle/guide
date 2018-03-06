# Creating a new project

1. Install [Crystal Lang](https://crystal-lang.org/)
1. Clone the project template (and optionally mirror it)
   * `git clone https://github.com/spider-gazelle/spider-gazelle.git`
   * `cd spider-gazelle`
   * `git push --mirror https://github.com/exampleuser/new-project.git`
   * `cd .. && git clone https://github.com/exampleuser/new-project.git`

## Configuring your project

Common configuration options, such as your projects name and cookie key names, can be found in [./src/config.cr](https://github.com/spider-gazelle/spider-gazelle/blob/master/src/config.cr)

## Running your project

* `crystal ./src/app.cr`

to have the project live reload as you develop

1. Install [NodeJS](https://nodejs.org/)
1. Install [nodemon](https://github.com/remy/nodemon) `npm i -g nodemon`

then run the following command to have your project live reload

* `nodemon --exec crystal ./src/app.cr`

## Testing your project

Spider-Gazelle leverages crystal langs built in [testing libraries](https://crystal-lang.org/docs/guides/testing.html)

* to run tests: `crystal spec`
* or as you edit code: `nodemon --exec crystal spec`

## Compiling your project

* `crystal build ./src/app.cr`

or

* `shards build --production`
  * grabs the latest dependencies before the build
  * deploys the binary as per the compile target in your `shard.yml`

once compiled there are a number of [command line options](https://github.com/spider-gazelle/spider-gazelle/blob/master/src/app.cr#L8)

* execute `./app --help` to see the options
* viewing routes `./app --routes`
* run on a different port or host `./app -b 0.0.0.0 -p 80`
