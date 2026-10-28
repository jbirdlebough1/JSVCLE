import subprocess
import urllib.request
import json

input_data = 'protocol=https\nhost=github.com\n\n'
proc = subprocess.run(['git', 'credential', 'fill'], input=input_data, text=True, capture_output=True)
token = [l.split('=', 1)[1] for l in proc.stdout.splitlines() if l.startswith('password=')][0]

gql_url = 'https://api.github.com/graphql'
query = """
query {
  user(login: "jbirdlebough1") {
    id
    projectsV2(first: 10) {
      nodes {
        id
        title
        number
        url
      }
    }
  }
  repository(owner: "jbirdlebough1", name: "JSVCLE") {
    id
    projectsV2(first: 10) {
      nodes {
        id
        title
        number
        url
      }
    }
  }
}
"""

headers = {'Authorization': f'Bearer {token}', 'User-Agent': 'JSVCLE-Project-Linker'}
req = urllib.request.Request(gql_url, data=json.dumps({'query': query}).encode('utf-8'), headers=headers)
with urllib.request.urlopen(req) as resp:
    res = json.loads(resp.read().decode('utf-8'))
    print(json.dumps(res, indent=2))

