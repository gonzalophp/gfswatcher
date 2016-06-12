[![Build Status: Linux](https://api.travis-ci.org/gonzalophp/gfswatcher.svg?branch=master)](https://travis-ci.org/gonzalophp/gfswatcher)

# gfswatcher
> Directory watcher

## Usage

```shell
gfswatcher-cli --config <filename>
```

## Config file

**Simple example**

```json
{
    "interval":1000,
    "sync": [
        {
            "source":"/home/user/path/project1",
            "cmd":"echo {{event.type}} -- {{event.path}}",
            "grouped":false
        }
    ]
}
```


**A more complex configuration for Docker environments. Many local sources to many remote docker containers:**

```json
{
    "interval":1000,
    "sync": [
        {
            "source":"/home/user/path/project1",
            "cmd":"rsync -e \"docker exec -i\"  {{opts.rsync}} {{source}}/. CONTAINER1:/home/sites/dir; rsync -e \"docker exec -i\" {{opts.rsync}} {{source}}/. CONTAINER2:/home/sites/dir",
            "opts":{
              "rsync":"--blocking-io -avz --delete --no-perms --no-owner --no-group --exclude-from=\"{{source}}/.dockerignore\" --exclude-from=\"{{source}}/.gitignore\" --exclude=\"{{source}}/web/images/upload\" --checksum --no-times --itemize-changes"
            },
            "grouped":true
        },
        {
            "source":"/home/user/path/project2",
            "cmd":"rsync -e \"docker exec -i\" {{opts.rsync}} {{source}}/. CONTAINER1:/home/sites/dir/vendor/brand/project; rsync -e \"docker exec -i\" {{opts.rsync}} {{source}}/. CONTAINER2:/home/sites/dir/vendor/brand/project",
            "opts":{
              "rsync":"--blocking-io -avz --delete --no-perms --no-owner --no-group --exclude-from=\"{{source}}/.dockerignore\" --exclude-from=\"{{source}}/.gitignore\" --exclude=\"{{source}}/web/images/upload\" --checksum --no-times --itemize-changes"
            },
            "grouped":true
        }
    ]
}
```
