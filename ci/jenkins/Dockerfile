# syntax=docker/dockerfile:1
#
# Jenkins controller with the tooling the SkillSwap pipeline needs on the
# agent: a Docker CLI (to build and push images) and Node 20 (to install
# dependencies and run the test suites).
#
# This talks to the host's Docker daemon through the mounted socket rather
# than running a daemon of its own - "Docker outside of Docker". It is the
# simpler and safer of the two options; the alternative, privileged
# Docker-in-Docker, is not needed to build an image.

FROM jenkins/jenkins:lts-jdk17

USER root

# Docker CLI only - no daemon. The socket is mounted in at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg lsb-release \
  && install -m 0755 -d /etc/apt/keyrings \
  && curl -fsSL https://download.docker.com/linux/debian/gpg \
       | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
  && chmod a+r /etc/apt/keyrings/docker.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
       https://download.docker.com/linux/debian $(lsb_release -cs) stable" \
       > /etc/apt/sources.list.d/docker.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends docker-ce-cli docker-compose-plugin \
  && rm -rf /var/lib/apt/lists/*

# Node 20, matching the runtime the server targets.
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && apt-get install -y --no-install-recommends nodejs \
  && rm -rf /var/lib/apt/lists/* \
  && node --version && npm --version

# Plugins the Jenkinsfile depends on, installed up front so the first build
# does not fail on a missing step (sonarqube-scanner, nodejs, ansiColor...).
COPY plugins.txt /usr/share/jenkins/ref/plugins.txt
RUN jenkins-plugin-cli --plugin-file /usr/share/jenkins/ref/plugins.txt

COPY jenkins.yaml /var/jenkins_home/casc/jenkins.yaml
RUN chown -R jenkins:jenkins /var/jenkins_home/casc

USER jenkins

# Skip the setup wizard - the admin user, tools, credentials and the job all
# come from the Configuration as Code file instead.
ENV JAVA_OPTS="-Djenkins.install.runSetupWizard=false" \
    CASC_JENKINS_CONFIG="/var/jenkins_home/casc/jenkins.yaml"
