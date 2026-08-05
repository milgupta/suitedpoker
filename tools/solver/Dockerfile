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

ARG TEXASSOLVER_REF=master
ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential cmake git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
RUN git clone https://github.com/bupticybee/TexasSolver.git . \
 && git checkout "${TEXASSOLVER_REF}" \
 && git rev-parse HEAD > /solver-commit.txt

RUN cmake -B build -DCMAKE_BUILD_TYPE=Release \
 && cmake --build build -j "$(nproc)"

# Collect whatever the build produced — the console binary's name has moved
# between releases, so resolve it rather than assuming.
RUN mkdir -p /out \
 && find build -maxdepth 3 -type f -perm -111 \
      \( -name 'console_solver*' -o -name 'TexasSolver*' -o -name 'solver*' \) \
      -exec cp {} /out/ \; \
 && ls -1 /out | tee /out/.binaries

FROM ubuntu:22.04

RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /out/ /usr/local/bin/
COPY --from=build /solver-commit.txt /solver-commit.txt
COPY --from=build /src/resources /resources

WORKDIR /work
ENTRYPOINT []
CMD ["bash"]
