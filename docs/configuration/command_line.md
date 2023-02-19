## Web server arguments

### Bind host

`-b HOST` or `--bind=HOST` allow to change host binded. Default : "127.0.0.1" 

### Bind port

`-p PORT` or `--port=PORT` allow to change port binded. Default : 3000

### Workers

`-w COUNT` or `--workers=COUNT` allow to change the number of processes to handle requests. Default : 1

## Usefull arguments

### List the application routes

`-r` or `--routes` display the list of application routes with `Controller#Action`, `Verb` and `URI Pattern`

Example : 

```shell
Controller#Action                   Verb   URI Pattern
AuthEndPoint#signin                 post   /api/users/login
AuthEndPoint#signup                 post   /api/users/
UserEndpoint#me                     get    /api/user/
UserEndpoint#update                 put    /api/user/
ProfileEndpoint#show                get    /api/profiles/:username
ProfileEndpoint#follow              post   /api/profiles/:username/follow
ProfileEndpoint#unfollow            delete /api/profiles/:username/follow
```

### Generate OpenAPI Documentation

`-d` or `--docs` return OpenAPI documentation in the STDOUT.

if you want the documentation in a file, you can add `-f FILE` ou `--file=FILE` to this command.

WARNING : this command works with `crystal` binary available.

### Curl

`-c URL` or `--curl=URL` perform a basic health check by requesting the URL.

this command is useful when you want to define a healthcheck command with docker, without having to install curl. For example, in an `FROM SCRATCH` image.