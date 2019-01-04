"use strict";

const gulp = require("gulp"),
  p = require("gulp-load-plugins")(),
  del = require("del"),
  bs = require("browser-sync").create(),
  fs = require("fs"),
  argv = require("yargs").argv,
  ftp = require("vinyl-ftp"),
  webpack = require("webpack-stream"),
  compiler = require("webpack"),
  utils = require("./gulp/utils"),
  constants = require("./gulp/constants");

let isProduction;

console.log(p);

// Remove build directory
gulp.task("clean", () => {
  return del(["dist"]);
});

gulp.task("clean:css", () => {
  return del(["dist/css/*.css", "!dist/css/build.css"]);
});

// Pug
gulp.task("pug", () => {
  const jsonFiles = {};
  utils.readJsonFilesToObject("src/pug/data/", jsonFiles);

  return gulp
    .src("src/pug/**/!(_)*.pug")
    .pipe(
      p.pug({
        locals: {
          isProduction,
          ...jsonFiles
        }
      })
    )
    .on(
      "error",
      p.notify.onError(error => {
        return {
          title: "Pug",
          message: error.message
        };
      })
    )
    .pipe(gulp.dest("dist"))
    .on("end", bs.reload);
});

gulp.task("styles:dev", () => {
  return gulp
    .src("src/sass/**/*.{sass,scss}")
    .pipe(p.sourcemaps.init())
    .pipe(p.plumber())
    .pipe(p.sass().on("error", p.sass.logError))
    .pipe(p.sourcemaps.write("."))
    .pipe(gulp.dest("dist/css"))
    .pipe(bs.reload({ stream: true }));
});

gulp.task("styles:build", () => {
  return gulp
    .src("src/sass/**/*.{sass,scss}")
    .pipe(p.sass().on("error", p.sass.logError))
    .pipe(p.postcss())
    .pipe(gulp.dest("dist/css"));
});

gulp.task("purifycss:libs", () => {
  return gulp
    .src(["dist/css/*.css", "!dist/css/main.css"])
    .pipe(
      p.purifycss(["dist/js/*.js", "dist/*.html"], constants.PURIFY_CSS_OPTIONS)
    )
    .pipe(
      p.uncss({
        html: ["dist/**/*.html"],
        ignore: []
      })
    )
    .pipe(gulp.dest("dist/css"));
});

gulp.task("purifycss:source", () => {
  return gulp
    .src("dist/css/main.css")
    .pipe(
      p.purifycss(["dist/js/*.js", "dist/*.html"], constants.PURIFY_CSS_OPTIONS)
    )
    .pipe(gulp.dest("dist/css"));
});

gulp.task("concat:css", function() {
  return gulp
    .src("dist/css/*.css")
    .pipe(p.concatCss("dist/css/build.css", { rebaseUrls: false }))
    .pipe(gulp.dest("./"));
});

// Scripts
gulp.task("scripts", () => {
  return gulp
    .src("src/js/**/*.js")
    .pipe(
      webpack(require("./webpack/webpack.dev.js"), compiler, function(
        err,
        stats
      ) {
        /* Use stats to do more things if needed */
      })
    )
    .pipe(gulp.dest("dist/js"));
});

// Watchers
gulp.task("watch", () => {
  gulp.watch("src/pug/**/*", gulp.series("pug"));

  gulp.watch("src/sass/**/*.{sass,scss}", gulp.series("styles:dev"));

  gulp.watch("src/fonts/**/*.*", gulp.series("fonts"));

  gulp.watch("src/img/**/*.*", gulp.series("img:dev"));

  gulp.watch("src/img/icons/svg/*.svg", gulp.series("svgSprite"));

  gulp.watch("src/js/**/*.js", gulp.series("scripts"));
});

// Fonts
gulp.task("fonts", () => {
  return gulp.src("src/fonts/**/*.*").pipe(gulp.dest("dist/fonts"));
});

// Img
gulp.task("img:dev", () => {
  return gulp.src("src/img/**/*.*").pipe(gulp.dest("dist/img"));
});

gulp.task("img:build", () => {
  return gulp
    .src(["src/img/**/*.{jpg,png,svg}", "!src/img/icons/**/*.svg"])
    .pipe(
      p.imagemin([
        p.imagemin.svgo({
          plugins: [
            {
              inlineStyles: {
                onlyMatchedOnce: false
              }
            },
            { removeStyleElement: true },
            {
              removeUnknownsAndDefaults: {
                keepDataAttrs: false
              }
            },
            {
              removeAttrs: {
                attrs: ["class"]
              }
            },
            {
              cleanupListOfValues: {
                floatPrecision: 2
              }
            },
            { removeTitle: false }
          ]
        })
      ])
    )
    .pipe(gulp.dest("dist/img"));
});

gulp.task("crop", () => {
  return gulp
    .src("src/img/crop/*.*")
    .pipe(
      p.imageResize({
        width: argv.width,
        height: argv.height,
        crop: Boolean(argv.width && argv.height),
        upscale: true,
        noProfile: true
      })
    )
    .pipe(p.rename({ suffix: `_${argv.width}` }))
    .pipe(gulp.dest("src/img/cropped"));
});

// Sprites
gulp.task("svgSprite", () => {
  let config = {
    log: "verbose",
    shape: {
      id: {
        separator: "--"
      },
      transform: [
        {
          svgo: {
            plugins: [
              {
                cleanupListOfValues: {
                  floatPrecision: 2
                }
              },
              { removeXMLNS: true },
              { removeTitle: false }
            ]
          }
        }
      ]
    },
    mode: {
      symbol: {
        dest: ".",
        sprite: "sprite.symbol.svg"
      }
    }
  };

  return gulp
    .src("**/*.svg", { cwd: "src/img/icons/svg" })
    .pipe(p.svgSprite(config))
    .pipe(gulp.dest("dist/img/icons/svg"));
});

gulp.task("deploy", () => {
  const ftpCredentials = JSON.parse(fs.readFileSync("./ftp.json"));
  const { host, user, password, folder } = ftpCredentials;

  let conn = ftp.create({
    host,
    user,
    password,
    parallel: 10,
    log: p.util
  });

  const globs = ["dist/**/*"];

  return gulp
    .src(globs, { base: "./dist", buffer: false })
    .pipe(conn.newer(folder))
    .pipe(conn.dest(folder));
});

// Browsersync
gulp.task("serve", function() {
  bs.init({
    server: {
      baseDir: "dist"
    }
  });
});

// Build:css
gulp.task(
  "build:css",
  gulp.series("purifycss:libs", "purifycss:source", "concat:css", "clean:css")
);

// Dev
gulp.task(
  "dev",
  gulp.series(
    // "clean",
    gulp.parallel(
      "styles:dev",
      "pug",
      "fonts",
      "img:dev",
      "svgSprite",
      "scripts"
    )
  )
);

// Build
gulp.task(
  "build",
  gulp.series(
    "clean",
    () =>
      new Promise(resolve => {
        isProduction = true;
        resolve();
      }),
    gulp.parallel("styles:build", "pug", "fonts", "img:build", "svgSprite")
  )
);

// Default task
gulp.task("default", gulp.series("dev", gulp.parallel("watch", "serve")));
