'use strict';

const pick = require('lodash/pick');
const parseQuery = require('./util/parseSearchQuery');
const toEsClient = require('./util/toEsClient');

function searchSimilar(q, esClient, options) {
    esClient = toEsClient(esClient);
    options = Object.assign({
        size: 10,
        minScore: 4.5,
        analyzerWeight: 2.2,
        scoreWeight: 1.5,
    }, options);

    const text = parseQuery.discardQualifiers(q);

    if (!text) {
        return Promise.resolve([]);
    }

    const source = '(doc["score.final"].value * params.analyzerWeight) * (_score * params.scoreWeight)';

    return Promise.resolve(esClient.search({
        /* eslint camelcase: 0 */
        index: 'npms-current',
        type: 'score',
        body: {
            size: options.size,
            query: {
                function_score: {
                    min_score: options.minScore,
                    boost_mode: 'replace',
                    query: {
                        fuzzy: {
                            'package.name.raw': {
                                value: text,
                            },
                        },
                    },
                    script_score: {
                        script: {
                            source,
                            params: {
                                analyzerWeight: options.analyzerWeight,
                                scoreWeight: options.scoreWeight,
                            },
                        },
                    },
                },
            },
        },
    }))
    .then((res) => res.hits.hits.map((hit) => {
        // We can't use _fields in the query because the JSON properties order get messed up,
        // see https://github.com/elastic/elasticsearch/issues/17639
        // So we filter the source fields manually with pick().. this is not ideal since there's payload
        // navigating through the network that we do not use, but it's definitively better than having order messed up
        const result = pick(hit._source, ['package', 'flags', 'score']);

        result.searchScore = hit._score;

        return result;
    }));
}

module.exports = searchSimilar;
