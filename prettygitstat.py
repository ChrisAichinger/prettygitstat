#!/usr/bin/python

import os
import collections
import json
import subprocess

AUTHOR_PREFIX = 'author '


def load_attribution_data():
    attributions = dict()
    files = subprocess.check_output(['git', 'ls-files', '-z']).split('\0')
    for fname in files:
        if not os.path.isfile(fname):
            continue

        author_lines = collections.Counter()
        blamecmd = ['git', 'blame', '--line-porcelain', fname]
        blamedata = subprocess.check_output(blamecmd)
        for line in blamedata.split('\n'):
            if not line.startswith(AUTHOR_PREFIX):
                continue

            author = line[len(AUTHOR_PREFIX):]
            author_lines[author] += 1

        attributions[fname] = author_lines

    return attributions


def main():
    attributions = load_attribution_data()
    json_attributions = json.dumps(attributions)
    print(json_attributions)

if __name__ == '__main__':
    main()
