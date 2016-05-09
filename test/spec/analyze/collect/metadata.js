'use strict';

const expect = require('chai').expect;
const chronokinesis = require('chronokinesis');
const loadJsonFile = require('load-json-file');
const packageJsonFromData = require(`${process.cwd()}/lib/analyze/util/packageJsonFromData`);
const metadata = require(`${process.cwd()}/lib/analyze/collect/metadata`);

const fixturesDir = `${process.cwd()}/test/fixtures/analyze/collect`;

describe('metadata', () => {
    it('should collect cross-spawn correctly', () => {
        const data = loadJsonFile.sync(`${fixturesDir}/modules/cross-spawn/data.json`);
        const expected = loadJsonFile.sync(`${fixturesDir}/modules/cross-spawn/expected-metadata.json`);

        chronokinesis.travel('2016-05-08T10:00:00.000Z');

        return metadata(data, packageJsonFromData('cross-spawn', data))
        .then((collected) => expect(collected).to.eql(expected))
        .finally(() => chronokinesis.reset());
    });

    it('should do a best effort to extract the publisher', () => {
        // Extract from npmUser
        return Promise.try(() => {
            const packageJson = {
                name: 'cross-spawn',
                _npmUser: { name: 'satazor', email: 'andremiguelcruz@msn.com' },
            };

            return metadata({}, packageJson)
            .then((collected) => expect(collected.publisher).to.eql({ username: 'satazor', email: 'andremiguelcruz@msn.com' }));
        })
        // Compare author with maintainers (top-level)
        .then(() => {
            const data = { maintainers: [{ name: 'satazor', email: 'andremiguelcruz@msn.com' }] };
            const packageJson = {
                name: 'cross-spawn',
                author: { name: 'André Cruz', email: 'andremiguelcruz@msn.com' },
            };

            return metadata(data, packageJson)
            .then((collected) => expect(collected.publisher).to.eql({ username: 'satazor', email: 'andremiguelcruz@msn.com' }));
        })
        // Compare author with maintainers
        .then(() => {
            const packageJson = {
                name: 'cross-spawn',
                author: { name: 'André Cruz', email: 'andremiguelcruz@msn.com' },
                maintainers: [{ name: 'satazor', email: 'andremiguelcruz@msn.com' }],
            };

            return metadata({}, packageJson)
            .then((collected) => expect(collected.publisher).to.eql({ username: 'satazor', email: 'andremiguelcruz@msn.com' }));
        });
    });

    it('should do a best effort to extract the maintainers', () => {
        // Compare author with maintainers (top-level)
        return Promise.try(() => {
            const data = { maintainers: [{ name: 'satazor', email: 'andremiguelcruz@msn.com' }] };
            const packageJson = { name: 'cross-spawn' };

            return metadata(data, packageJson)
            .then((collected) => expect(collected.maintainers).to.eql([{ username: 'satazor', email: 'andremiguelcruz@msn.com' }]));
        })
        // Compare author with maintainers
        .then(() => {
            const packageJson = {
                name: 'cross-spawn',
                maintainers: [{ name: 'satazor', email: 'andremiguelcruz@msn.com' }],
            };

            return metadata({}, packageJson)
            .then((collected) => expect(collected.maintainers).to.eql([{ username: 'satazor', email: 'andremiguelcruz@msn.com' }]));
        });
    });

    it('should not fail if there are no versions nor time properties', () => {
        return metadata({}, { name: 'cross-spawn' })
        .then((collected) => {
            expect(collected).to.eql({
                name: 'cross-spawn',
                releases: {
                    first: { version: '0.0.1' },
                    latest: { version: '0.0.1' },
                },
                hasTestScript: false,
            });
        });
    });

    it('should delete README if it is `No README data`', () => {
        return metadata({ readme: 'No README data' }, { name: 'cross-spawn' })
        .then((collected) => expect(collected).to.not.have.property('readme'));
    });

    it('should handle strange README\'s', () => {
        // In old modules the README is an object, e.g.: `flatsite`
        return metadata({ readme: {} }, { name: 'flatsite' })
        .then((collected) => expect(collected).to.not.have.property('readme'));
    });

    it('should handle bundleDependencies compatibility', () => {
        const packageJson = {
            name: 'flatsite',
            bundleDependencies: { react: '15.0.0' },
        };

        // In old modules the README is an object, e.g.: `flatsite`
        return metadata({}, packageJson)
        .then((collected) => expect(collected.bundledDependencies).to.eql({ react: '15.0.0' }));
    });

    it('should detect deprecated repositories', () => {
        return metadata({}, { name: 'cross-spawn', deprecated: 'use something else' })
        .then((collected) => expect(collected.deprecated).to.equal('use something else'));
    });

    it('should detect repositories with no test script', () => {
        // No scripts
        return Promise.try(() => {
            return metadata({}, { name: 'cross-spawn' })
            .then((collected) => expect(collected.hasTestScript).to.equal(false));
        })
        // No test scripts
        .then(() => {
            return metadata({}, { name: 'cross-spawn', scripts: {} })
            .then((collected) => expect(collected.hasTestScript).to.equal(false));
        })
        // No tests specified
        .then(() => {
            return metadata({}, { name: 'cross-spawn', scripts: { test: 'no test specified' } })
            .then((collected) => expect(collected.hasTestScript).to.equal(false));
        })
        // Detect test
        .then(() => {
            return metadata({}, { name: 'cross-spawn', scripts: { test: 'mocha' } })
            .then((collected) => expect(collected.hasTestScript).to.equal(true));
        });
    });

    describe('license', () => {
        it('should deal with licenses as arrays of strings', () => {
            return metadata({}, { name: 'cross-spawn', license: ['MIT'] })
            .then((collected) => expect(collected.license).to.equal('MIT'));
        });

        it('should deal with licenses as arrays of objects', () => {
            return metadata({}, {
                name: 'cross-spawn',
                license: [
                    { type: 'MIT', url: 'https://opensource.org/licenses/MIT' },
                    { type: 'GPL-3.0', url: 'https://opensource.org/licenses/GPL-3.0' },
                ],
            })
            .then((collected) => expect(collected.license).to.equal('MIT OR GPL-3.0'));
        });

        it('should deal with licenses as objects', () => {
            return metadata({}, {
                name: 'cross-spawn',
                license: { type: 'MIT', url: 'https://opensource.org/licenses/MIT' },
            })
            .then((collected) => expect(collected.license).to.equal('MIT'));
        });

        it('should preserve spdx expressions', () => {
            return metadata({}, {
                name: 'cross-spawn',
                license: 'MIT OR GPL-3.0',
            })
            .then((collected) => expect(collected.license).to.equal('MIT OR GPL-3.0'));
        });

        it('should correct to spdx licenses', () => {
            return metadata({}, {
                name: 'cross-spawn',
                license: 'GPL',
            })
            .then((collected) => expect(collected.license).to.equal('GPL-3.0'));
        });
    });
});
