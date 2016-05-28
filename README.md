# gfswatcher
> A recursive directory watcher running shell commands

## Usage

```shell
gfswatcher --config <filename>
```

## Config file

**Many local sources to many remote docker containers:**

```json
{
    "interval":1000,
    "sync": [
        {
            "source":"/home/user/path/project1",
            "shell":"rsync -e \"docker exec -i\"  {{opts.rsync}} {{source}}/. CONTAINER1:/home/sites/dir; rsync -e \"docker exec -i\" {{opts.rsync}} {{source}}/. CONTAINER2:/home/sites/dir",
            "opts":{
              "rsync":"--blocking-io -avz --delete --no-perms --no-owner --no-group --exclude-from=\"{{source}}/.dockerignore\" --exclude-from=\"{{source}}/.gitignore\" --exclude=\"{{source}}/web/images/upload\" --checksum --no-times --itemize-changes"
            },
            "grouped":true
        },
        {
            "source":"/home/user/path/project2",
            "shell":"rsync -e \"docker exec -i\" {{opts.rsync}} {{source}}/. CONTAINER1:/home/sites/dir/vendor/brand/project; rsync -e \"docker exec -i\" {{opts.rsync}} {{source}}/. CONTAINER2:/home/sites/dir/vendor/brand/project",
            "opts":{
              "rsync":"--blocking-io -avz --delete --no-perms --no-owner --no-group --exclude-from=\"{{source}}/.dockerignore\" --exclude-from=\"{{source}}/.gitignore\" --exclude=\"{{source}}/web/images/upload\" --checksum --no-times --itemize-changes"
            },
            "grouped":true
        }
    ]
}
```
