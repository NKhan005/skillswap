// SkillSwap CI/CD
// GitHub -> Jenkins -> SonarQube -> Docker -> Docker Hub -> Coolify / AWS EKS
//
// Jenkins credentials this pipeline expects:
//   dockerhub-credentials  Username/password for Docker Hub
//   sonarqube-token        Secret text, SonarQube user token
//   coolify-webhook        Secret text, full Coolify deploy webhook URL
//   coolify-token          Secret text, Coolify API token
//   kubeconfig-eks         Secret file, kubeconfig for the EKS cluster
// Tools configured in Jenkins:
//   NodeJS 20  (Manage Jenkins > Tools > NodeJS)
//   SonarScanner (Manage Jenkins > Tools > SonarQube Scanner)

pipeline {
  agent any

  tools {
    nodejs 'NodeJS-20'
  }

  environment {
    DOCKERHUB_NAMESPACE = 'gowthami'
    SERVER_IMAGE        = "${DOCKERHUB_NAMESPACE}/skillswap-server"
    CLIENT_IMAGE        = "${DOCKERHUB_NAMESPACE}/skillswap-client"
    // A short SHA makes every build traceable back to a commit.
    IMAGE_TAG           = "${env.BUILD_NUMBER}-${env.GIT_COMMIT ? env.GIT_COMMIT.take(7) : 'local'}"
    SONAR_PROJECT_KEY   = 'skillswap'
    DOCKER_BUILDKIT     = '1'
  }

  options {
    timestamps()
    ansiColor('xterm')
    buildDiscarder(logRotator(numToKeepStr: '20', artifactNumToKeepStr: '5'))
    timeout(time: 40, unit: 'MINUTES')
    disableConcurrentBuilds()
  }

  // Defaults are deliberately the safe, self-contained ones: a fresh Jenkins
  // with no Docker Hub login and nowhere to deploy still gets a green build
  // that checks out, tests, analyses and builds both images. Turn each
  // outward-facing step on once its credentials exist.
  parameters {
    booleanParam(
      name: 'RUN_SONAR',
      defaultValue: true,
      description: 'Run SonarQube analysis and wait for the quality gate.'
    )
    booleanParam(
      name: 'PUSH_IMAGES',
      defaultValue: false,
      description: 'Push images to Docker Hub. Needs the dockerhub-credentials credential.'
    )
    choice(
      name: 'DEPLOY_TARGET',
      choices: ['none', 'coolify', 'eks'],
      description: 'Where to deploy after a successful push. "none" builds only.'
    )
  }

  stages {

    stage('Checkout SCM') {
      steps {
        checkout scm
        script {
          env.GIT_SHORT = sh(script: 'git rev-parse --short HEAD', returnStdout: true).trim()
          env.GIT_BRANCH_NAME = sh(script: 'git rev-parse --abbrev-ref HEAD', returnStdout: true).trim()
          echo "Building ${env.GIT_BRANCH_NAME} @ ${env.GIT_SHORT}"
        }
      }
    }

    stage('Install dependencies') {
      parallel {
        stage('server') {
          steps {
            dir('server') {
              sh 'npm ci --no-audit --no-fund || npm install --no-audit --no-fund'
            }
          }
        }
        stage('client') {
          steps {
            dir('client') {
              sh 'npm ci --no-audit --no-fund || npm install --no-audit --no-fund'
            }
          }
        }
      }
    }

    stage('Test') {
      steps {
        dir('server') {
          sh 'npm test'
        }
      }
    }

    stage('Build client bundle') {
      steps {
        dir('client') {
          // Built here as well as in the Docker image so a broken bundle
          // fails the pipeline before any image is produced.
          sh 'npm run build'
        }
      }
    }

    stage('SonarQube analysis') {
      when { expression { return params.RUN_SONAR } }
      steps {
        script {
          def scannerHome = tool 'SonarScanner'
          withSonarQubeEnv('SonarQube') {
            sh """
              ${scannerHome}/bin/sonar-scanner \
                -Dsonar.projectKey=${SONAR_PROJECT_KEY} \
                -Dsonar.projectVersion=${IMAGE_TAG} \
                -Dsonar.sources=server/src,client/src \
                -Dsonar.tests=server/tests \
                -Dsonar.test.inclusions=server/tests/**/*.test.js \
                -Dsonar.exclusions=**/node_modules/**,**/dist/**,**/coverage/**
            """
          }
        }
      }
    }

    stage('Quality gate') {
      when { expression { return params.RUN_SONAR } }
      steps {
        // Waits on the SonarQube webhook; a failed gate stops the release.
        // SonarQube must be able to reach Jenkins back, so the webhook under
        // Administration > Configuration > Webhooks has to exist or this
        // simply times out.
        timeout(time: 10, unit: 'MINUTES') {
          waitForQualityGate abortPipeline: true
        }
      }
    }

    stage('Build Docker images') {
      parallel {
        stage('server image') {
          steps {
            sh """
              docker build \
                -t ${SERVER_IMAGE}:${IMAGE_TAG} \
                -t ${SERVER_IMAGE}:latest \
                ./server
            """
          }
        }
        stage('client image') {
          steps {
            sh """
              docker build \
                --build-arg VITE_API_URL= \
                --build-arg VITE_SOCKET_URL= \
                -t ${CLIENT_IMAGE}:${IMAGE_TAG} \
                -t ${CLIENT_IMAGE}:latest \
                ./client
            """
          }
        }
      }
    }

    stage('Image scan') {
      steps {
        // Non-blocking: report vulnerabilities without gating the build while
        // the base images are still being hardened.
        sh """
          if command -v trivy >/dev/null 2>&1; then
            trivy image --severity HIGH,CRITICAL --exit-code 0 ${SERVER_IMAGE}:${IMAGE_TAG}
            trivy image --severity HIGH,CRITICAL --exit-code 0 ${CLIENT_IMAGE}:${IMAGE_TAG}
          else
            echo 'trivy not installed on this agent, skipping image scan'
          fi
        """
      }
    }

    stage('Push to Docker Hub') {
      when { expression { return params.PUSH_IMAGES } }
      steps {
        withCredentials([usernamePassword(
          credentialsId: 'dockerhub-credentials',
          usernameVariable: 'DOCKER_USER',
          passwordVariable: 'DOCKER_PASS'
        )]) {
          sh '''
            echo "$DOCKER_PASS" | docker login -u "$DOCKER_USER" --password-stdin
          '''
          sh """
            docker push ${SERVER_IMAGE}:${IMAGE_TAG}
            docker push ${SERVER_IMAGE}:latest
            docker push ${CLIENT_IMAGE}:${IMAGE_TAG}
            docker push ${CLIENT_IMAGE}:latest
          """
        }
      }
    }

    stage('Deploy') {
      when { expression { return params.DEPLOY_TARGET != 'none' } }
      parallel {

        stage('Coolify') {
          when { expression { return params.DEPLOY_TARGET == 'coolify' } }
          steps {
            // Single-quoted so Groovy never interpolates the secret into the
            // script text; both values arrive as shell environment variables.
            withCredentials([string(credentialsId: 'coolify-webhook', variable: 'COOLIFY_WEBHOOK')]) {
              sh '''
                curl -fsSL -X POST "$COOLIFY_WEBHOOK" \
                  -H "Content-Type: application/json" \
                  -d "{\\"tag\\":\\"${IMAGE_TAG}\\"}"
              '''
            }
            echo "Coolify deploy triggered for ${IMAGE_TAG}"
          }
        }

        stage('AWS EKS') {
          when { expression { return params.DEPLOY_TARGET == 'eks' } }
          steps {
            withCredentials([file(credentialsId: 'kubeconfig-eks', variable: 'KUBECONFIG')]) {
              sh """
                kubectl -n skillswap set image deployment/skillswap-server \
                  server=${SERVER_IMAGE}:${IMAGE_TAG} --record
                kubectl -n skillswap set image deployment/skillswap-client \
                  client=${CLIENT_IMAGE}:${IMAGE_TAG} --record

                kubectl -n skillswap rollout status deployment/skillswap-server --timeout=180s
                kubectl -n skillswap rollout status deployment/skillswap-client --timeout=180s
              """
            }
          }
        }
      }
    }

    stage('Smoke test') {
      when { expression { return params.DEPLOY_TARGET != 'none' } }
      steps {
        script {
          def url = env.SMOKE_URL ?: 'http://localhost:8080/api/health'
          sh """
            for i in 1 2 3 4 5 6 7 8 9 10; do
              if curl -fsS ${url}; then
                echo '\\nSmoke test passed'
                exit 0
              fi
              echo "Attempt \$i failed, retrying in 10s"
              sleep 10
            done
            echo 'Smoke test failed'
            exit 1
          """
        }
      }
    }
  }

  post {
    always {
      // Keep the agent's disk from filling with every tagged build.
      sh """
        docker rmi ${SERVER_IMAGE}:${IMAGE_TAG} ${CLIENT_IMAGE}:${IMAGE_TAG} || true
        docker image prune -f || true
      """
      cleanWs(deleteDirs: true, notFailBuild: true)
    }
    success {
      echo "SkillSwap ${IMAGE_TAG} built and deployed."
    }
    failure {
      echo "SkillSwap build ${env.BUILD_NUMBER} failed. See ${env.BUILD_URL}console"
    }
  }
}
