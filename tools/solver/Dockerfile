# TexasSolver, pinned and reproducible.
#
# The commit is NOT hardcoded as a hash in this file, because a hash written by
# hand is a hash nobody verified. Instead the build records whatever it
# actually cloned into /solver-commit.txt, and the runner reads that file and
# puts it in the manifest. "Which solver build produced this" then comes from
# the image rather than from a comment.
#
# Pin a specific ref at build time:
#   docker build --build-arg TEXASSOLVER_REF=<tag-or-sha> \
#     -t suitedpoker/texassolver:pinned tools/solver

FROM ubuntu:22.04 AS build

ARG TEXASSOLVER_REF=v0.2.0
ARG DEBIAN_FRONTEND=noninteractive

# qmake + Qt5 + OpenMP, NOT cmake. TexasSolver ships a single Qt .pro that
# compiles the GUI and the console entry point together; there is no
# CMakeLists.txt anywhere in the tree.
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential git ca-certificates \
      qtbase5-dev qtbase5-dev-tools qt5-qmake libomp-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
RUN git clone https://github.com/bupticybee/TexasSolver.git . \
 && git checkout "${TEXASSOLVER_REF}" \
 && git rev-parse HEAD > /solver-commit.txt

RUN qmake TexasSolverGui.pro CONFIG+=release \
 && make -j "$(nproc)"

# Collect whatever the build produced — the console binary's name has moved
# between releases, so resolve it rather than assuming.
RUN mkdir -p /out \
 && find . -maxdepth 3 -type f -perm -111 \
      \( -name 'console_solver*' -o -name 'TexasSolver*' -o -name 'solver*' \) \
      -exec cp {} /out/ \; \
 && ls -1 /out | tee /out/.binaries

FROM ubuntu:22.04

# The Qt5 RUNTIME libs, not just libstdc++. The binary links against
# Widgets/Gui/Core even in console mode, and omitting them fails at exec with a
# shared-library error rather than at build.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libstdc++6 libqt5core5a libqt5gui5 libqt5widgets5 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /out/ /usr/local/bin/
COPY --from=build /solver-commit.txt /solver-commit.txt
COPY --from=build /src/resources /resources

WORKDIR /work
ENTRYPOINT []
CMD ["bash"]
