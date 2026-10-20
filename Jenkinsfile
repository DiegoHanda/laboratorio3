// Pipeline: un push a la rama principal prueba, construye, publica y despliega.
// Nadie ejecuta kubectl a mano: el único acceso al cluster es el kubeconfig guardado como credencial de Jenkins.
//
// Credenciales de Jenkins necesarias:
//   registry-creds           (usuario y token del registro de imágenes)
//   kubeconfig-team2         (archivo: el kubeconfig del equipo)
//   reservas-admin-password  (texto secreto: contraseña inicial del administrador)
// El agente solo necesita docker (para tests y build) y kubectl (para el deploy).
// Los tests corren dentro de contenedores, así que Jenkins no necesita Node.

pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
  }

  triggers {
    pollSCM('H/2 * * * *') // quitar si el repositorio avisa por webhook
  }

  environment {
    REGISTRY  = 'docker.io/dh54912398'
    HOST      = 'reservas-team2.reto-ucu.net'
    NAMESPACE = 'alumno-team2'
  }

  stages {
    stage('Configuración') {
      steps {
        script {
          if (env.REGISTRY == 'COMPLETAR' || env.HOST == 'COMPLETAR') {
            error('Completar REGISTRY y HOST en el Jenkinsfile')
          }
          // Las imágenes se etiquetan con el commit que las originó.
          env.TAG = env.GIT_COMMIT ? env.GIT_COMMIT.take(7) : env.BUILD_NUMBER
        }
        // Informativo: muestra qué herramientas tiene el agente.
        sh 'for c in docker kubectl; do command -v $c >/dev/null && echo "OK: $c" || echo "FALTA: $c"; done'
      }
    }

    stage('Tests') {
      parallel {
        stage('API') {
          steps {
            sh '''
              set -e
              docker build --target test -t reservas-api-test:$BUILD_NUMBER api
              PG=$(docker run -d --rm -e POSTGRES_PASSWORD=test postgres:16-alpine)
              trap "docker stop $PG >/dev/null" EXIT
              # Por TCP: durante el arranque inicial Postgres solo escucha por socket y respondería "listo" antes de tiempo.
              until docker exec $PG pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; do sleep 1; done
              docker run --rm --network container:$PG \
                -e DATABASE_URL=postgres://postgres:test@127.0.0.1:5432/postgres \
                reservas-api-test:$BUILD_NUMBER
            '''
          }
        }
        stage('Web') {
          steps {
            sh 'docker build --target test -t reservas-web-test:$BUILD_NUMBER web'
          }
        }
      }
    }

    stage('Build') {
      steps {
        sh '''
          docker build -t $REGISTRY/reservas-api:$TAG api
          docker build -t $REGISTRY/reservas-web:$TAG web
        '''
      }
    }

    stage('Push') {
      steps {
        withCredentials([usernamePassword(credentialsId: 'registry-creds', usernameVariable: 'REG_USER', passwordVariable: 'REG_PASS')]) {
          sh '''
            echo "$REG_PASS" | docker login "${REGISTRY%%/*}" -u "$REG_USER" --password-stdin
            docker push $REGISTRY/reservas-api:$TAG
            docker push $REGISTRY/reservas-web:$TAG
          '''
        }
      }
    }

    stage('Deploy') {
      // Solo la rama principal despliega (sirve en multibranch y en un job de pipeline simple).
      when { expression { (env.BRANCH_NAME ?: env.GIT_BRANCH ?: 'main') ==~ /(origin\/)?main/ } }
      steps {
        withCredentials([
          file(credentialsId: 'kubeconfig-team2', variable: 'KUBECONFIG'),
          string(credentialsId: 'reservas-admin-password', variable: 'ADMIN_PASSWORD')
        ]) {
          sh '''
            set -e
            rand() { head -c "$1" /dev/urandom | od -An -tx1 | tr -d '[:space:]'; }

            # Los secretos se crean una sola vez; la base conserva sus datos entre despliegues.
            kubectl get secret reservas-secrets -n $NAMESPACE >/dev/null 2>&1 || \
              kubectl create secret generic reservas-secrets -n $NAMESPACE \
                --from-literal=DB_PASSWORD="$(rand 16)" \
                --from-literal=JWT_SECRET="$(rand 32)" \
                --from-literal=ADMIN_EMAIL="admin@reservas.test" \
                --from-literal=ADMIN_PASSWORD="$ADMIN_PASSWORD"

            for f in k8s/*.yaml; do
              sed -e 's|${REGISTRY}|'"$REGISTRY"'|g' -e 's|${TAG}|'"$TAG"'|g' -e 's|${HOST}|'"$HOST"'|g' "$f" \
                | kubectl apply -n $NAMESPACE -f -
            done

            kubectl rollout status statefulset/postgres -n $NAMESPACE --timeout=180s
            kubectl rollout status deployment/api -n $NAMESPACE --timeout=180s
            kubectl rollout status deployment/web -n $NAMESPACE --timeout=180s
          '''
        }
      }
    }
  }
}
