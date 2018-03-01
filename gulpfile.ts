import * as gulp from 'gulp';
import * as tsc from 'gulp-typescript';
import * as message from 'gulp-message';
import * as changed from 'gulp-changed-in-place';
import * as tap from 'gulp-tap';
import tslint from 'gulp-tslint';
import { exec } from 'child_process';
import { join, basename, relative } from 'path';
import { rollup } from 'rollup';
import * as rollupResolve from 'rollup-plugin-node-resolve';
import * as rollupBabel from 'rollup-plugin-babel';
import * as rollupUglify from 'rollup-plugin-uglify';
import { serve } from 'docsify-cli/lib';
import * as runSequence from 'run-sequence';
import * as del from 'del';
import * as merge2 from 'merge2';
import * as R from 'ramda';

// ------
// Config

const paths = {
    src: 'src/',
    build: 'lib/',
    content: 'docs/',
    public: 'dist/'    // packaged assets ready for deploy
};

const tsConfig = (project: string, basePath = paths.src) =>
    join('.', basePath, project, 'tsconfig.json');

const tsProject = R.compose<string, string, tsc.Project>(tsc.createProject, tsConfig);

// This project is composed of a few discrete TS components due to the need to
// use different libraries / compile targets.
const app = tsProject('app');
const serviceWorkers = tsProject('service-workers');
const analysers = tsProject('analysers');

// ------
// Tools

/**
 * Create a pipe that directs a single stream to an arbitrary destination.
 *
 * :: WritableStream a, ReadableStream b => a -> b -> a
 */
const pipe = <T extends NodeJS.WritableStream, U extends NodeJS.ReadableStream>
    (dest: T) => (src: U) => src.pipe(dest);

/**
 * Merge a collection of streams into one.
 *
 * Note: intentionally just a thin wrapper around merge2 in order to provide
 * a generic type restricted to ReadWriteStreams. Without this tsc has issues
 * due to the possible IOptions type.
 *
 * :: ReadWriteStream a => [a] -> a
 */
const merge = <T extends NodeJS.ReadWriteStream>
    (streams: T[]) => merge2(streams);

/**
 * Merge and pipe a collection of streams to an arbitrary destination.
 *
 * :: ReadWriteStream a, ReadableStream b => a -> [b] -> a
 */
const pipeTo = <T extends NodeJS.ReadWriteStream, U extends NodeJS.ReadableStream>
    (dest: T) => (src: U[]) => R.compose(pipe(dest), merge)(src);

/**
 * Create a pipe that will send the incoming contents to a folder on disk.
 *
 * :: ReadableStream a, ReadWriteStream b => string -> [a] -> b
 */
const writeTo = R.compose(pipeTo, (folder: string) => gulp.dest(folder));

/**
 *  Compile a TypeScript project.
 *
 * :: Project -> ReadWriteStream
 */
const compileProject = (project: tsc.Project) => {
    const compile = pipeTo(project());
    const {js, dts} = compile([project.src()]);
    return writeTo(project.config.compilerOptions.outDir)([js, dts]);
};

/**
 * Execute a shell process. When supplied with a command and the arguments a
 * promise will be return tuple of [stdout, stderr]. The promise will either
 * resolve or reject based on the process exit condition.
 *
 * :: string -> [string] -> Promise [string, string]
 */
const shellProcess = (command: string) => (args: string[] = []) =>
    new Promise<[string, string]>((resolve, reject) =>
        exec(
            `${command} ${args.join(' ')}`,
            (err, stdout, stderr) => (err ? reject : resolve)([stdout, stderr])
        )
    );

/**
 * Proofread a set of markdown files. Returns a promise that always contains the
 * proofing summary and either resolves or rejects based on the proofing
 * outcome.
 *
 * :: [string] -> Promise string
 */
const proof = (globs: string[]) =>
    R.compose(
        shellProcess('node node_modules/markdown-proofing/cli.js'),
        R.append('--color')
    )(globs)
        .then(([stdout, _]) => stdout)
        .catch(stdio => { throw new Error(stdio.join('\n')); });

/**
 * Bundle an ES6 module graph for use in browser.
 */
const bundle = (entry: string, src = paths.build, dest = paths.public) =>
    rollup({
        entry: join(src, entry),
        plugins: [
            rollupResolve(),
            rollupBabel({ exclude: 'node_modules/**' }),
            rollupUglify()
        ]
    })
    .then(b =>
        b.write({
            dest: join(dest, basename(entry)),
            format: 'iife'
        })
    );

// ------
// Base Tasks

/**
 * Lint all project Typescript source.
 */
gulp.task('lint', () =>
    (
        (...globs: string[]) =>
            gulp.src(globs)
                .pipe(tslint({
                    formatter: 'verbose'
                }))
                .pipe(tslint.report())
    )
    (
        `${paths.src}**/*.ts`,
        __filename
    )
);

/**
 * Run the proofing tools over all the docs.
 */
gulp.task('proof', () =>
    (
        (...globs: string[]) =>
            proof(globs)
                .then(message.info)
                .catch(summary => {
                    message.info(summary);
                    throw new Error('content does not meet readability / proofing requirements');
                })
    )
    (
        `${paths.content}*/*.md`,
        '*.md'
    )
);

/**
 * Nuke old build assets.
 */
gulp.task('clean', () =>
    (
        (...globs: string[]) => del(globs)
    )
    (
        paths.public,
        paths.build
    )
);

/**
 * Build the site front-end.
 */
gulp.task('compile:app', () => compileProject(app));

/**
 * Build the service workers
 */
gulp.task('compile:sw', () => compileProject(serviceWorkers));

/**
 * Build the content proofing tools.
 */
gulp.task('compile:tools', () => compileProject(analysers));

/**
 * Prep the service workers for use in-browser.
 */
gulp.task('package:sw', () => bundle('service-workers/doc-cache.js'));

/**
 * Bundle the frontend js components.
 */
gulp.task('package:app', () => bundle('app/app.js'));

/**
 * Collect the static assets for the public site.
 */
gulp.task('package:static', () =>
    (
        (...globs: string[]) => {
            const site = gulp.src(globs);
            return writeTo(paths.public)([site]);
        }
    )
    (
        `${paths.src}app/*.html`,
        `${paths.src}app/*.ico`,
        `${paths.src}app/coverpage*`,
        `${paths.content}**/*.*`
    )
);

gulp.task('serve', () => serve(paths.public, true, 3000));

/**
 * Watch doc content for updates and reproof / push to public for viewing on
 * save.
 */
gulp.task('watch:content', () =>
    (
        (...globs: string[]) => {
            message.info('Watching content for updates');

            const relativePath = file => relative(__dirname, file.path);

            const proofFile = R.compose(proof, R.of, relativePath);

            const proofStream = (cb: (summary: string) => void) =>
                tap(f => proofFile(f).then(cb).catch(cb));

            const proofChanged = (src: string[]) =>
                gulp.src(src)
                    .pipe(changed())
                    .pipe(proofStream(message.info))
                    .pipe(gulp.dest(paths.public));

            proofChanged(globs);
            return gulp.watch(globs, {}, () => proofChanged(globs));
        }
    )
    (
        `${paths.content}**/*.md`,
        '*.md'
    )
);

// ------
// Composite Tasks

const sequence = (...tasks: Array<string | string[]>) => cb => runSequence(...tasks, cb);

/**
 * Perform a complete project build and package ready for deploy
 */
gulp.task('build',
    sequence(
        ['lint', 'clean'],
        'compile:tools',
        'proof',
        ['compile:sw', 'compile:app'],
        ['package:static', 'package:app', 'package:sw'],
    )
);

/**
 * Run project tests
 */
gulp.task('test',
    sequence(
        ['lint', 'clean'],
        'compile:tools',
        'proof'
    )
);

/**
 * Launch the docs with live reload and proof read all content on save.
 */
gulp.task('write',
    sequence(
        'build',
        ['serve', 'watch:content'],
    )
);

gulp.task('default',
    sequence(
        'write'
    )
);
